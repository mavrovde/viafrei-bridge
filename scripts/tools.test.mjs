#!/usr/bin/env node
// Self-test for the shared `scripts/` helper modules — `tools.mjs` and
// `fixture-root.mjs` — and for the sweep that keeps the first one's reason true.
//
// The module exists because every script here spawned `git`, `npm`, `tar` and
// `mkdir` by bare name, which is a lookup through `$PATH` — so the environment,
// not this repository, decided which program the publish gate and the leak
// sweep actually ran. Fixing the twenty call sites is a one-off; the thing worth
// testing is that the twenty-first cannot be written without noticing, which is
// what the last case in this file is for.
//
// The sweep has three PRECONDITIONS, because a gate whose input is absent
// reports success about what it never read:
//   1. every source root must have been read, and the total must clear a floor
//      (it looked at the whole repo, not just the part that clears a floor);
//   2. it must find the call sites that ARE there (it can see a call at all);
//   3. it must go red on a planted bad call (it can say no).
// Without 3 in particular, an expression that matches nothing would pass this
// file forever while the rule it names went unenforced.
import { strict as assert } from 'node:assert';
import { accessSync, constants, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, extname, isAbsolute, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

import { missingFixtureImports } from './fixture-root.mjs';
import { TOOL_DIRS, ToolError, nodePath, npmCliPath, resolveTool } from './tools.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = join(here, '..');
const cases = [];
let failed = 0;

function check(name, fn) {
    try {
        fn();
        cases.push(`  ok   ${name}`);
    } catch (error) {
        failed += 1;
        // EVERY line, indented - not just the first. The sweep below builds a
        // list of offending files and the first draft printed only its opening
        // line, so a failure said "a bare call exists" and never said where.
        const detail = String(error?.message ?? error)
            .split('\n')
            .map(line => `       ${line}`)
            .join('\n');
        cases.push(`  FAIL ${name}\n${detail}`);
    }
}

// --- resolveTool ------------------------------------------------------------

check('git resolves to an absolute path inside TOOL_DIRS', () => {
    const path = resolveTool('git');
    assert.ok(isAbsolute(path), `not absolute: ${path}`);
    assert.ok(TOOL_DIRS.some(dir => path === join(dir, 'git')), `outside TOOL_DIRS: ${path}`);
    accessSync(path, constants.X_OK);
});

check('tar resolves to an absolute path inside TOOL_DIRS', () => {
    const path = resolveTool('tar');
    assert.ok(isAbsolute(path), `not absolute: ${path}`);
    assert.ok(TOOL_DIRS.some(dir => path === join(dir, 'tar')), `outside TOOL_DIRS: ${path}`);
    accessSync(path, constants.X_OK);
});

check('the same name twice gives the same answer (the cache does not lie)', () => {
    assert.equal(resolveTool('git'), resolveTool('git'));
});

check('TOOL_DIRS holds only root-owned directories — no /usr/local/bin, no /opt/homebrew/bin', () => {
    // This is the module's whole reason, so it is asserted rather than trusted.
    // Both excluded directories are writable by the logged-in user on a normal
    // developer machine, which is the substitution the module prevents.
    assert.deepEqual([...TOOL_DIRS], ['/usr/bin', '/bin']);
    for (const writable of ['/usr/local/bin', '/opt/homebrew/bin', '.', '']) {
        assert.ok(!TOOL_DIRS.includes(writable), `TOOL_DIRS must not include ${writable}`);
    }
    // And the property actually relied on, rather than the list that is supposed
    // to have it: owned by root, and not writable by group or other. A directory
    // anyone else can write to is a directory anyone else can put `git` in.
    for (const dir of TOOL_DIRS) {
        const info = statSync(dir);
        assert.equal(info.uid, 0, `${dir} is not owned by root (uid ${info.uid})`);
        // 0o022 = group-write | other-write.
        assert.equal(info.mode & 0o022, 0, `${dir} is writable by group or other (mode ${(info.mode & 0o777).toString(8)})`);
    }
});

check('TOOL_DIRS cannot be extended at runtime', () => {
    assert.throws(() => { TOOL_DIRS.push('/tmp'); });
});

check('a name carrying a path is refused, absolute or relative', () => {
    for (const bad of ['/usr/bin/git', './git', 'bin/git', '..\\git']) {
        assert.throws(() => resolveTool(bad), ToolError, `should refuse ${bad}`);
    }
});

check('an empty or non-string name is refused', () => {
    for (const bad of ['', undefined, null, 42, {}]) {
        assert.throws(() => resolveTool(bad), ToolError);
    }
});

check('a tool in neither directory is refused, and the message names both', () => {
    let message = '';
    try {
        resolveTool('viafrei-no-such-tool-exists');
        assert.fail('should have thrown');
    } catch (error) {
        assert.ok(error instanceof ToolError, `wrong error type: ${error?.name}`);
        message = error.message;
    }
    for (const dir of TOOL_DIRS) {
        assert.ok(message.includes(dir), `message does not name ${dir}: ${message}`);
    }
    assert.ok(/\$PATH/u.test(message), 'the message should say $PATH is deliberately not searched');
});

// --- node and npm -----------------------------------------------------------

check('nodePath() is the running node, absolute and executable', () => {
    const path = nodePath();
    assert.equal(path, process.execPath);
    assert.ok(isAbsolute(path), `not absolute: ${path}`);
    accessSync(path, constants.X_OK);
});

check("npmCliPath() is an existing absolute .js file, so node can run it", () => {
    const path = npmCliPath();
    assert.ok(isAbsolute(path), `not absolute: ${path}`);
    assert.equal(extname(path), '.js', `not a JavaScript file: ${path}`);
    accessSync(path, constants.R_OK);
    assert.ok(statSync(path).isFile(), `not a file: ${path}`);
});

check('npmCliPath() ignores an npm_execpath that is absolute and real but not npm', () => {
    // THE case this function exists for, and the one the first draft passed while
    // being wrong: a file that is absolute, exists, is readable and ends in `.js`.
    // The first draft returned it, and check-tarball.mjs would have run it as npm
    // - the substitution this module was written to remove, moved from $PATH to an
    // environment variable. Written to a real temporary file, because "it exists"
    // is half of what made it convincing.
    const saved = process.env.npm_execpath;
    const workspace = mkdtempSync(join(tmpdir(), 'viafrei-not-npm-'));
    try {
        const impostor = join(workspace, 'npm-cli.js');
        writeFileSync(impostor, 'process.exit(0);\n');
        process.env.npm_execpath = impostor;
        const answer = npmCliPath();
        assert.notEqual(answer, impostor, 'an absolute, existing, non-npm .js file was trusted');
        assert.ok(
            answer.replace(/\\/gu, '/').endsWith('/node_modules/npm/bin/npm-cli.js'),
            `fell back to something that is not npm's CLI: ${answer}`
        );
    } finally {
        rmSync(workspace, { recursive: true, force: true });
        if (saved === undefined) delete process.env.npm_execpath;
        else process.env.npm_execpath = saved;
    }
});

check('npmCliPath() ignores an npm_execpath of the wrong shape', () => {
    const saved = process.env.npm_execpath;
    try {
        for (const bogus of ['npm', 'relative/npm-cli.js', '/somewhere/npm.sh', '']) {
            process.env.npm_execpath = bogus;
            // Must still find npm beside the running node rather than trusting
            // the variable — or refuse. What it must never do is hand back the
            // bogus value.
            let answer = '';
            try {
                answer = npmCliPath();
            } catch (error) {
                assert.ok(error instanceof ToolError);
                continue;
            }
            assert.notEqual(answer, bogus, `npm_execpath=${bogus} was trusted`);
            assert.ok(isAbsolute(answer) && answer.endsWith('.js'));
        }
    } finally {
        if (saved === undefined) delete process.env.npm_execpath;
        else process.env.npm_execpath = saved;
    }
});

// --- fixture-root.mjs: the precondition the self-tests share ---------------

// WHY THESE TWO CASES EXIST. `missingFixtureImports()` was extracted because the
// same eleven lines lived in two self-tests and SonarCloud failed the pull
// request on it. Extracting it was right, and it widened the blast radius: one
// silent `return []` now disarms EVERY self-test that relies on it at once and
// restores the wrong-reason pass that started the whole thread — a sweep that
// cannot start reporting no findings. No count of those callers is written here,
// because there was one more of them within the week and the sentence that said
// "both" went stale unnoticed. On every ordinary run they exercise only the
// COMPLETE-fixture path, so without these the "missing" branch had no automated
// proof at all; it was checked by hand-mutating a file list, which is not a thing
// that happens again.

check('missingFixtureImports() finds an import whose file is not beside it', () => {
    const workspace = mkdtempSync(join(tmpdir(), 'viafrei-fixture-'));
    try {
        // `lib` rather than `scripts`, which exercises the directory parameter at
        // the same time — it had no caller, and an argument no caller passes is a
        // branch nothing reads.
        const dir = join(workspace, 'lib');
        mkdirSync(dir);
        writeFileSync(join(dir, 'present.mjs'), "export const x = 1;\n");
        writeFileSync(join(dir, 'broken.mjs'), "import { x } from './present.mjs';\nimport { y } from './absent.mjs';\nexport const z = x + y;\n");
        const missing = missingFixtureImports(workspace, 'lib');
        assert.deepEqual(missing, ['broken.mjs imports ./absent.mjs']);
    } finally {
        rmSync(workspace, { recursive: true, force: true });
    }
});

check('missingFixtureImports() returns an empty list for a complete fixture', () => {
    // The other direction, so "reports everything" cannot masquerade as working:
    // an empty list is the ONLY thing that lets a suite proceed, so a function
    // that always found something would be just as broken.
    const workspace = mkdtempSync(join(tmpdir(), 'viafrei-fixture-ok-'));
    try {
        const dir = join(workspace, 'lib');
        mkdirSync(dir);
        writeFileSync(join(dir, 'present.mjs'), "export const x = 1;\n");
        writeFileSync(join(dir, 'user.mjs'), "import { x } from './present.mjs';\nexport const y = x;\n");
        assert.deepEqual(missingFixtureImports(workspace, 'lib'), []);
    } finally {
        rmSync(workspace, { recursive: true, force: true });
    }
});

// --- the sweep: no source file may spawn a program by bare name -------------

// A call whose program argument is a single-quoted or double-quoted literal with
// no path separator in it. That is exactly the shape `$PATH` decides, and exactly
// what SonarCloud's javascript:S4036 reports. `\s*` spans newlines, so a call
// whose program sits on its own line is seen - which a single-line grep does not,
// and which is how the first count of the call sites came out one short.
//
// The lookbehind applies to `exec` ALONE, and the shape of this expression is the
// whole reason. `\b` does not stop `RE.exec('git')` from matching, because the `.`
// before `exec` is itself a word boundary, and three `.exec(` calls already exist
// here - so a future one with a literal argument would be reported as a spawn.
// But an earlier draft put `(?<!\.)` in front of the whole alternation, and that
// bought the false positive back at the price of a WORSE false negative: every
// member-expression spawn went invisible. Measured over twelve shapes - the
// all-names lookbehind was wrong on four of them, this form on none:
//
// The twelve shapes, written WITHOUT quote characters on purpose - an example of
// a bare call, spelled as one, is a bare call as far as the sweep below is
// concerned, and the first draft of this very comment turned the file red:
//
//   reported     execFileSync(P) · child_process.execFileSync(P) · cp.execSync(P)
//                · cp.spawnSync(P) · cp?.execSync(P) · exec(P) · a call whose P
//                sits on its own line                                       [7]
//   not reported RE.exec(P) · a slash-regex .exec(P) · execFileSync(resolveTool(P))
//                · an absolute path · nodePath()                            [5]
//
// where P stands for a quoted program name.
//
// Only the bare name `exec` collides with `RegExp.prototype.exec`, so only it
// needs `(?<![.\w])`; the other five keep their member forms, which is the
// direction that matters, since those are shapes SonarJS reports and a
// contributor can write without doing anything unusual.
//
// WHAT THIS DOES NOT SEE, stated because a limits list nobody wrote is a limit
// nobody knows about:
//   * a template literal - execFileSync(`git`, …);
//   * a program held in a variable or a const, which is the one that matters:
//     SonarJS resolves a single-assignment variable back to its literal, so
//     `const GIT = 'git'` would pass HERE and still redden the project's rating
//     there. This local gate is deliberately weaker than the thing it stands in
//     for, and that is the direction of the gap;
//   * a promisified `execFile`, or a third-party runner such as `execa`;
//   * a program built at runtime from pieces;
//   * `obj.exec('git')` - a method named `exec` on something that is not a
//     regular expression. That is the one trade the lookbehind above makes, and
//     no expression can tell it apart from `RE.exec('git')` without a parser.
// All five are reasons to read the module's doc comment rather than to trust this
// expression as a proof.
const BARE_CALL = /(?:\b(?:execFileSync|execFile|spawnSync|spawn|execSync)|(?<![.\w])exec)\s*\(\s*(['"])([^'"\n/\\]+)\1/gu;

function bareCalls(text) {
    const hits = [];
    for (const match of text.matchAll(BARE_CALL)) {
        hits.push({ fn: match[0].slice(0, match[0].indexOf('(')).trim(), program: match[2] });
    }
    return hits;
}

const ROOTS = ['scripts', 'src', 'test'];

// RECURSIVE. The first draft used one flat `readdirSync` per directory, so the day
// anyone adds `src/lib/foo.ts` the sweep would never read it and nothing would
// say so. The tree is flat today; a gate that only works on today's tree is the
// silent-skip class waiting for a directory.
function filesUnder(absolute) {
    const found = [];
    for (const entry of readdirSync(absolute, { withFileTypes: true })) {
        const path = join(absolute, entry.name);
        if (entry.isDirectory()) {
            if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
            found.push(...filesUnder(path));
        } else if (entry.isFile() && /\.(?:mjs|js|ts)$/u.test(entry.name)) {
            found.push(path);
        }
    }
    return found;
}

// Per ROOT, and an unreadable root is NOT skipped. The first draft `continue`d on
// a directory it could not read and compared the total against a floor of 20 -
// which `scripts` and `test` clear between them, so `src/` could be deleted
// entirely and precondition 1 still printed ok. A floor on a sum is not a
// precondition on its parts.
const byRoot = new Map();
const rootErrors = new Map();
for (const dir of ROOTS) {
    try {
        byRoot.set(dir, filesUnder(join(ROOT, dir)).sort());
    } catch (error) {
        rootErrors.set(dir, String(error?.message ?? error));
    }
}
const files = [...byRoot.values()].flat().sort();
const MIN_FILES = 20;

check(`precondition 1: every source root was read (${ROOTS.map(d => `${d}=${(byRoot.get(d) ?? []).length}`).join(' ')}, total ${files.length}, floor ${MIN_FILES})`, () => {
    assert.equal(
        rootErrors.size,
        0,
        `a source root could not be read, which is a failure and not an absence: ${
            [...rootErrors].map(([dir, message]) => `${dir} (${message})`).join(', ')
        }`
    );
    for (const dir of ROOTS) {
        assert.ok(
            (byRoot.get(dir) ?? []).length >= 1,
            `${dir}/ contributed no source file — either it moved, or this sweep is ` +
            'now blind to a whole tree while still reporting a comfortable total'
        );
    }
    assert.ok(
        files.length >= MIN_FILES,
        `only ${files.length} source file(s) across ${ROOTS.join(', ')} — ` +
        'a sweep with nothing to read would pass while enforcing nothing'
    );
});

check('precondition 2: the expression locates a program argument in a REAL file of this repo', () => {
    // The claim is not "some file contains execFileSync". It is that BARE_CALL
    // finds the PROGRAM argument, which is the part deciding whether a call is a
    // $PATH lookup — so it is proved by running BARE_CALL itself over a real file
    // with a real call in it. The first draft asserted this in a comment and then
    // measured something else: the positive arm used a simpler regex and never
    // asked BARE_CALL to read a file at all, so the sentence above it was not
    // what ran.
    const sq = String.fromCharCode(39);
    assert.equal(
        bareCalls(`execFileSync(resolveTool(${sq}git${sq}), [])`).length, 0,
        'a helper-resolved call must not be reported'
    );

    // Take a file that really spawns something, put its program back to a bare
    // literal in memory only, and require BARE_CALL to find that program by name.
    // THIS file is excluded, and the exclusion is asserted rather than assumed:
    // the call pattern appears here as a PATTERN, not as a call, so it matches the
    // filter and then has no program to find. Found by running this case, which is
    // the behaviour a precondition is supposed to have.
    const self = join(ROOT, 'scripts', 'tools.test.mjs');
    assert.ok(files.includes(self), 'this file must itself be swept by the case below');
    const spawners = files.filter(file => file !== self
        && /execFileSync\s*\(\s*resolveTool\(/u.test(readFileSync(file, 'utf8')));
    assert.ok(spawners.length >= 3, `only ${spawners.length} file(s) spawn through the helper`);
    let proved = 0;
    for (const file of spawners) {
        const asItWas = readFileSync(file, 'utf8').replace(
            /execFileSync\(\s*resolveTool\((['"])(\w+)\1\)/gu,
            (_match, quote, program) => `execFileSync(${quote}${program}${quote}`
        );
        const hits = bareCalls(asItWas);
        assert.ok(hits.length >= 1, `BARE_CALL found no program in ${relative(ROOT, file)} with its helper removed`);
        for (const hit of hits) {
            assert.match(hit.program, /^(?:git|tar|npm|node|mkdir)$/u, `unexpected program: ${hit.program}`);
        }
        proved += hits.length;
    }
    assert.ok(proved >= 5, `only ${proved} program argument(s) located across ${spawners.length} real file(s)`);
});

check('precondition 3: the sweep goes red on a planted bare call (it can say no)', () => {
    // Assembled at runtime, so the literal never appears in this file and the
    // sweep below does not find its own fixture. A hard-coded string here would
    // make this file fail its own sweep, and the usual repair for that — an
    // exclusion — is what lets a real regression hide.
    const q = String.fromCharCode(39);
    for (const program of ['git', 'npm', 'tar', 'mkdir', 'sh']) {
        const planted = `execFileSync(${q}${program}${q}, [${q}--version${q}])`;
        const hits = bareCalls(planted);
        assert.equal(hits.length, 1, `planted ${program} call not reported: ${planted}`);
        assert.equal(hits[0].program, program);
    }
    // And a shape it must NOT report, so "red on everything" cannot masquerade
    // as a working sweep: a path is not a $PATH lookup.
    assert.equal(bareCalls(`execFileSync(${q}/usr/bin/git${q}, [])`).length, 0);
    assert.equal(bareCalls('execFileSync(nodePath(), [])').length, 0);

    // The member-expression decision, PINNED in both directions rather than left
    // incidental - a round of review changed it by accident once already. A spawn
    // reached through an object IS a $PATH lookup and must be reported; `.exec` on
    // a regular expression is not a spawn at all and must not be.
    for (const shape of [
        `child_process.execFileSync(${q}git${q}, [])`,
        `cp.execSync(${q}git status${q})`,
        `cp?.execSync(${q}git${q})`,
    ]) {
        assert.equal(bareCalls(shape).length, 1, `member-expression spawn not reported: ${shape}`);
    }
    for (const shape of [`RE.exec(${q}git status${q})`, `/x/.exec(${q}tar${q})`]) {
        assert.equal(bareCalls(shape).length, 0, `a regex .exec must not be reported: ${shape}`);
    }
});

check('no source file spawns a program by bare name — every program comes from tools.mjs', () => {
    const offences = [];
    for (const file of files) {
        for (const hit of bareCalls(readFileSync(file, 'utf8'))) {
            offences.push(`${relative(ROOT, file)}: ${hit.fn}('${hit.program}', …)`);
        }
    }
    assert.equal(
        offences.length,
        0,
        'a program spawned by bare name is resolved through $PATH, so the ' +
        'environment chooses it (javascript:S4036). Use resolveTool(), ' +
        `nodePath() or npmCliPath() from scripts/tools.mjs:\n       ${offences.join('\n       ')}`
    );
});

console.log(cases.join('\n'));
if (failed > 0) {
    console.error(`\ntool-resolution self-test: FAIL - ${failed} of ${cases.length} case(s)`);
    process.exit(1);
}
console.log(`\ntool-resolution self-test: PASS - ${cases.length} cases, ${files.length} source file(s) swept`);

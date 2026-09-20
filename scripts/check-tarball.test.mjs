#!/usr/bin/env node
/**
 * Self-test for the publish-hygiene gate.
 *
 * A gate nobody has seen fail is not known to work. This packs the real
 * tarball, checks that the gate accepts it, then poisons a copy in each of the
 * ways the gate exists to catch and checks that it is rejected - naming the
 * finding, so a case cannot pass by failing for the wrong reason.
 *
 * **Every case is derived from the gate's own rules**, not typed out here: one
 * per lifecycle script npm can start by itself, one per forbidden file name,
 * one per required file, one per content pattern, and one per encoding at each
 * alignment. A rule added to the gate is a case added here; a rule list that
 * goes empty is a REFUSAL to run rather than a smaller, quieter pass. That was
 * a real hole: this file used to exit on `failures === 0` whatever the number
 * of cases, so emptying a list in `rules.json` deleted six cases and still
 * printed PASS.
 *
 * Nothing private is written down here, in any form. The private-name cases
 * invent a token at run time, hand its salted hash to the gate through
 * `VF_EXTRA_TOKEN_HASHES`, and hide it in the tarball; the poison strings for
 * the content patterns are decoded from the rules' own `sample` fields.
 *
 * Exit 0 = every case behaved, 1 = a case failed, 2 = the test could not run,
 * which is also a failure.
 */
import { execFileSync } from 'node:child_process';
import { appendFileSync, cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { AUTO_RUN_SCRIPTS, FORBIDDEN_NAMES, REQUIRED } from './check-tarball.mjs';
import { hashToken, loadRules } from './rules.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const GATE = join(ROOT, 'scripts/check-tarball.mjs');
const RULES = loadRules(ROOT);

const log = message => {
    process.stdout.write(`${message}\n`);
};

/** Stop rather than run a smaller test and call it the same test. */
const refuse = reason => {
    log('');
    log(`gate self-test: CANNOT RUN - ${reason}`);
    log('gate self-test: this is a failure, not a pass: a suite that shrank has not proved what it used to');
    process.exit(2);
};

// ---------------------------------------------------------------------------
// Tokens: invented here, never a real name, and no longer than a real one.
// ---------------------------------------------------------------------------

function inventToken(length) {
    const letters = 'abcdefghijklmnopqrstuvwxyz';
    let token = '';
    while (token.length < length) {
        token += letters[Math.floor(Math.random() * letters.length)];
    }
    return token;
}

/** A middling name, and the shortest the rules claim to cover. */
const SECRET = inventToken(Math.min(RULES.maxTokenLength, RULES.minTokenLength + 4));
const SHORTEST = inventToken(RULES.minTokenLength);
const envFor = token => ({ ...process.env, VF_EXTRA_TOKEN_HASHES: hashToken(RULES.salt, token) });

const hex = text => Buffer.from(text).toString('hex');
const b64 = text => Buffer.from(text).toString('base64');
/**
 * Filler either side of the name inside the encoded run.
 *
 * Deliberately NOT letters: a letter next to the name makes one identifier, and
 * then the case would be testing the tokeniser rather than the alignment. Real
 * encoded payloads have punctuation and separators in them; this is that.
 */
const pad = count => '-'.repeat(count);

// ---------------------------------------------------------------------------
// The plan, built from the gate's own rules.
// ---------------------------------------------------------------------------

const plan = [];
const add = (kind, name, expectation, poison, env = process.env, codes = [1]) => {
    plan.push({ kind, name, expectation, poison, env, codes });
};

function editManifest(directory, edit) {
    const path = join(directory, 'package.json');
    const manifest = JSON.parse(readFileSync(path, 'utf8'));
    edit(manifest);
    writeFileSync(path, JSON.stringify(manifest, null, 2));
}

function writeInto(directory, relative, contents) {
    const path = join(directory, relative);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, contents);
}

// --- one case per script npm can start by itself ---------------------------
if (AUTO_RUN_SCRIPTS.size === 0) {
    refuse('the gate lists no auto-run scripts, so every lifecycle script would pass');
}
for (const script of AUTO_RUN_SCRIPTS) {
    add('lifecycle', `lifecycle-${script}`, `lifecycle script.*"${script}"`, directory => {
        editManifest(directory, manifest => {
            manifest.scripts = { ...manifest.scripts, [script]: 'node -e "process.exit(0)"' };
        });
    });
}
add('lifecycle', 'gypfile-manifest', 'lifecycle script.*gypfile', directory => {
    editManifest(directory, manifest => {
        manifest.gypfile = true;
    });
});

// --- one case per forbidden file name, from the rule's own sample ----------
if (FORBIDDEN_NAMES.length === 0) {
    refuse('the gate lists no forbidden file names');
}
for (const rule of FORBIDDEN_NAMES) {
    if (typeof rule.sample !== 'string' || !rule.test(rule.sample)) {
        refuse(`the file-name rule "${rule.label}" has no sample that it rejects, so nothing proves it works`);
    }
    add('file name', `file-${rule.label.replace(/[^a-z]+/giu, '-')}`, 'file name', directory => {
        writeInto(directory, rule.sample, 'poison\n');
    });
}

// --- one case per required file -------------------------------------------
if (REQUIRED.length === 0) {
    refuse('the gate requires no files, so an empty tarball would be the package');
}
for (const required of REQUIRED) {
    const relative = required.replace(/^package\//u, '');
    // Removing the manifest leaves the gate nothing to read, so it exits 2 -
    // "could not run", which is a failure too and is the honest answer here.
    const isManifest = relative === 'package.json';
    add(
        'contents',
        `missing-${relative.replace(/[^a-z]+/giu, '-')}`,
        isManifest ? 'could not run' : 'contents',
        directory => {
            unlinkSync(join(directory, relative));
        },
        process.env,
        isManifest ? [2] : [1]
    );
}

// --- dependencies, judged by what they resolve to --------------------------
const DEPENDENCY_SPECS = [
    { name: 'a-viafrei-dependency', dependency: '@viafrei/mcp', spec: '*', expectation: 'dependencies.*scope carries the platform' },
    {
        name: 'a-viafrei-dependency-shouting',
        dependency: '@VIAFREI/mcp',
        spec: '*',
        expectation: 'dependencies.*scope carries the platform'
    },
    {
        name: 'an-npm-alias-onto-the-private-scope',
        dependency: 'mcp-helper',
        spec: 'npm:@viafrei/mcp@^1.0.0',
        expectation: 'dependencies.*scope carries the platform'
    },
    {
        name: 'an-npm-alias-shouting',
        dependency: 'mcp-helper',
        spec: 'npm:@ViaFrei/mcp@^1.0.0',
        expectation: 'dependencies.*scope carries the platform'
    },
    {
        name: 'the-private-repo-under-another-name',
        dependency: 'vf-platform',
        spec: 'git+ssh://git@github.com/example/example.git#main',
        expectation: 'dependencies.*not a registry semver range'
    },
    { name: 'a-tarball-url', dependency: 'helper', spec: 'https://example.invalid/helper.tgz', expectation: 'dependencies.*not a registry semver range' },
    { name: 'a-file-path', dependency: 'helper', spec: 'file:../helper', expectation: 'dependencies.*not a registry semver range' },
    { name: 'a-workspace-link', dependency: 'helper', spec: 'workspace:*', expectation: 'dependencies.*not a registry semver range' },
    { name: 'a-github-shorthand', dependency: 'helper', spec: 'github:example/example', expectation: 'dependencies.*not a registry semver range' },
    { name: 'an-alias-onto-a-git-url', dependency: 'helper', spec: 'npm:other@git+ssh://git@github.com/example/example.git', expectation: 'dependencies.*not a registry semver range' }
];
for (const entry of DEPENDENCY_SPECS) {
    add('dependencies', entry.name, entry.expectation, directory => {
        editManifest(directory, manifest => {
            manifest.dependencies = { ...manifest.dependencies, [entry.dependency]: entry.spec };
        });
    });
}
add('dependencies', 'a-bundled-dependency', 'dependencies.*bundleDependencies', directory => {
    editManifest(directory, manifest => {
        manifest.bundleDependencies = ['helper'];
    });
});

// --- one case per content pattern, from the rule's own sample --------------
for (const [list, label, target] of [
    [RULES.embeddedSourcePatterns, 'embedded', 'dist/cli.js'],
    [RULES.tarballPatterns, 'content', 'dist/index.js']
]) {
    if (list.length === 0) {
        refuse(`the rules file lists no ${label} patterns`);
    }
    for (const rule of list) {
        if (typeof rule.sample !== 'string' || !new RegExp(rule.source, `${rule.flags ?? ''}u`).test(rule.sample)) {
            refuse(`the pattern "${rule.label}" has no sample that it matches, so nothing proves it works`);
        }
        add('content', `${label}-${rule.label.replace(/\s+/gu, '-')}`, 'content:', directory => {
            appendFileSync(join(directory, target), `\n// ${rule.sample}\n`);
        });
    }
}

// --- one case per encoding, at every alignment, with the name at the TAIL ---
//
// The tail is where the last defect lived: the hex decoder truncated the run
// before it shifted, so the odd alignment lost the run's final byte every time
// and a name at the end of a run was invisible. Head and middle placements
// passed throughout, which is why nothing caught it.
const ENCODING_CASES = [];
for (let shift = 0; shift < 4; shift += 1) {
    ENCODING_CASES.push({
        name: `base64-tail-alignment-${shift}`,
        expectation: 'private name.*as base64',
        token: SECRET,
        build: token => `const blob = "${b64(pad(shift) + token)}";`
    });
}
ENCODING_CASES.push(
    {
        name: 'base64-middle',
        expectation: 'private name.*as base64',
        token: SECRET,
        build: token => `const blob = "${b64(`${pad(2)}${token}${pad(3)}`)}";`
    },
    {
        name: 'base64-shortest-name',
        expectation: 'private name.*as base64',
        token: SHORTEST,
        build: token => `const blob = "${b64(token)}";`
    },
    {
        name: 'hex-tail-even-alignment',
        expectation: 'private name.*as hex',
        token: SECRET,
        build: token => `const blob = "${hex(pad(2) + token)}";`
    },
    {
        name: 'hex-tail-odd-alignment',
        expectation: 'private name.*as hex',
        token: SECRET,
        build: token => `const blob = "${`c${hex(pad(2) + token)}`}";`
    },
    {
        name: 'hex-middle-odd-alignment',
        expectation: 'private name.*as hex',
        token: SECRET,
        build: token => `const blob = "${`c${hex(`${pad(2)}${token}${pad(2)}`)}`}";`
    },
    {
        name: 'hex-head',
        expectation: 'private name.*as hex',
        token: SECRET,
        build: token => `const blob = "${hex(token + pad(3))}";`
    },
    {
        name: 'hex-shortest-name-odd-alignment',
        expectation: 'private name.*as hex',
        token: SHORTEST,
        build: token => `const blob = "${`c${hex(pad(2) + token)}`}";`
    },
    {
        name: 'percent-encoded',
        expectation: 'private name.*as percent',
        token: SECRET,
        build: token => `const blob = "${[...token].map(character => `%${character.charCodeAt(0).toString(16)}`).join('')}";`
    },
    {
        name: 'javascript-escapes',
        expectation: 'private name.*as js-escape',
        token: SECRET,
        build: token => `const blob = "${[...token].map(character => `\\x${character.charCodeAt(0).toString(16)}`).join('')}";`
    },
    {
        name: 'split-across-literals',
        expectation: 'private name.*as concatenated literals',
        token: SECRET,
        build: token => `const blob = "${token.slice(0, 3)}" + "${token.slice(3)}";`
    },
    {
        name: 'plaintext-inside-a-longer-identifier',
        expectation: 'private name.*as plaintext',
        token: SECRET,
        build: token => `const my_${token}_backup = 1;`
    }
);
if (ENCODING_CASES.length === 0) {
    refuse('no encoding cases');
}
for (const entry of ENCODING_CASES) {
    add(
        'private name',
        entry.name,
        entry.expectation,
        directory => {
            appendFileSync(join(directory, 'dist/cli.js'), `\n${entry.build(entry.token)}\n`);
        },
        envFor(entry.token)
    );
}

// ---------------------------------------------------------------------------
// Run it.
// ---------------------------------------------------------------------------

const workspace = mkdtempSync(join(tmpdir(), 'viafrei-gate-test-'));
let failures = 0;
let ran = 0;

function runGate(tarball, env = process.env) {
    try {
        const stdout = execFileSync(process.execPath, [GATE, tarball], { encoding: 'utf8', cwd: ROOT, env });
        return { code: 0, stdout };
    } catch (error) {
        return { code: error.status ?? -1, stdout: `${error.stdout ?? ''}${error.stderr ?? ''}` };
    }
}

function pack() {
    // Built here, because the published manifest may not carry a `prepack` to
    // do it - that is one of the things being tested.
    execFileSync('npm', ['run', 'build'], { cwd: ROOT, stdio: ['ignore', 'ignore', 'inherit'] });
    const out = JSON.parse(
        execFileSync('npm', ['pack', '--json', '--pack-destination', workspace], {
            cwd: ROOT,
            encoding: 'utf8',
            stdio: ['ignore', 'pipe', 'inherit']
        })
    );
    return join(workspace, out[0].filename);
}

function poisonedTarball(name, poison) {
    const directory = join(workspace, `poison-${name}`);
    cpSync(join(workspace, 'clean'), directory, { recursive: true });
    poison(join(directory, 'package'));
    const tarball = join(workspace, `poison-${name}.tgz`);
    execFileSync('tar', ['-czf', tarball, '-C', directory, 'package']);
    return tarball;
}

try {
    log('gate self-test');
    log(`  ${plan.length} poisoned tarballs, every one of them derived from a rule the gate reads`);
    log(`  private-name cases use invented tokens of ${SHORTEST.length} and ${SECRET.length} characters, new every run`);
    log(`  (the rules are ${RULES.minTokenLength}-${RULES.maxTokenLength} characters, so a longer stand-in would prove nothing)`);
    log('');

    const clean = pack();
    mkdirSync(join(workspace, 'clean'), { recursive: true });
    execFileSync('tar', ['-xzf', clean, '-C', join(workspace, 'clean')]);

    ran += 1;
    const cleanResult = runGate(clean);
    if (cleanResult.code === 0) {
        log('  PASS  the gate accepted the real tarball');
    } else {
        failures += 1;
        log(`  FAIL  the gate rejected the real tarball (exit ${cleanResult.code})`);
        log(cleanResult.stdout);
    }

    for (const entry of plan) {
        ran += 1;
        const result = runGate(poisonedTarball(entry.name, entry.poison), entry.env);
        const caught = entry.codes.includes(result.code) && new RegExp(entry.expectation, 'u').test(result.stdout);
        if (caught) {
            log(`  PASS  rejected "${entry.name}" (${entry.kind})`);
        } else {
            failures += 1;
            log(`  FAIL  ACCEPTED "${entry.name}" (${entry.kind}, exit ${result.code}) - it would have shipped`);
            log(result.stdout);
        }
    }

    log('');
    if (ran !== plan.length + 1) {
        refuse(`${plan.length + 1} cases were planned and ${ran} ran`);
    }
    if (failures === 0) {
        log(`gate self-test: PASS - ${ran} cases (${plan.length} poisoned, 1 clean), every poisoned tarball rejected`);
    } else {
        log(`gate self-test: FAIL - ${failures} of ${ran} case(s)`);
    }
} finally {
    rmSync(workspace, { recursive: true, force: true });
}

process.exit(failures === 0 ? 0 : 1);

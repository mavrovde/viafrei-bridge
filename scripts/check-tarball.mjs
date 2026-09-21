#!/usr/bin/env node
/**
 * Publish-hygiene gate.
 *
 * Runs against the BUILT tarball - `npm pack`, then unpack and read the files -
 * never against the source tree or the build config. The assertion is about
 * what is published, not about what was meant.
 *
 * Five checks. The first three were here from the start; the last two exist
 * because a reviewer got a `postinstall`, a git dependency on the private
 * repository and a base64-encoded schema past the first three.
 *
 *   1. **Contents.** The tarball is the package: the required files are there,
 *      and nothing is there that has no business being published - a source
 *      map, a `.ts`, a test, an `.env`, a workflow, a bundled `node_modules`,
 *      a `binding.gyp` (which would run node-gyp on a stranger's machine).
 *   2. **No embedded sources** - `sourcesContent`, `sourceMappingURL` or an
 *      inline `//# source` comment. A bundler can put the original TypeScript
 *      *inside* the `.js`, which passes a "no .map files" check while shipping
 *      the sources verbatim.
 *   3. **No platform content** - SQL, the database driver, or a private name.
 *      The bridge relays; it never speaks SQL.
 *   4. **No lifecycle script.** `"postinstall": "node -e ..."` in the published
 *      manifest is remote code execution on every machine that installs this,
 *      and no file-level check sees it because the payload is one line of the
 *      manifest. The published manifest may carry no script npm can run by
 *      itself.
 *   5. **Dependencies judged by what they RESOLVE to, not by their name.** A
 *      name prefix is not a control: `"vf-platform":
 *      "git+ssh://git@github.com/…"` has no `@viafrei/` in it and pulls the
 *      whole platform. Every dependency must be a registry semver range.
 *
 * And the scan itself decodes: base64, hex, percent-encoding, JavaScript
 * escapes and concatenated string literals are all looked through. What it
 * still cannot see is printed on every run rather than left to be assumed.
 *
 * Usage:
 *   node scripts/check-tarball.mjs              # builds, packs, then checks
 *   node scripts/check-tarball.mjs some.tgz     # checks an existing tarball
 *
 * `VF_EXTRA_TOKEN_HASHES` (comma-separated) adds token hashes for this run.
 * The self-test uses it to prove the private-name path works without writing a
 * private name - or a stand-in for one - anywhere in this repository.
 *
 * Exit 0 = clean, 1 = a finding, 2 = the gate could not run (which is also a
 * failure: a gate that cannot run has not passed).
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { blindSpots, loadRules, opaque, safeMessage, safeString, scanFile, thresholds } from './rules.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const RULES = loadRules(ROOT);

/**
 * The ruleset has to be able to find something before the gate may report that
 * it found nothing.
 *
 * check-leaks has refused on an empty rule list since round 3; this leg did
 * not, so on its own it would have run a smaller, quieter check. Both
 * workflows run both legs, so the system refused - but a leg that only refuses
 * because of its neighbour is not a leg that refuses.
 */
function unrunnable() {
    if (RULES.tokenHashes.size === 0) {
        return 'the rules file lists no private-name hashes';
    }
    if (RULES.tarballPatterns.length === 0) {
        return 'the rules file lists no tarball patterns';
    }
    if (RULES.embeddedSourcePatterns.length === 0) {
        return 'the rules file lists no embedded-source patterns';
    }
    try {
        // Token range, numbers window, numbers allow-list: all of it, up front.
        thresholds(RULES);
    } catch (error) {
        return error instanceof Error ? error.message : String(error);
    }
    return undefined;
}

/** Files that must be in the tarball for it to be the package at all. */
export const REQUIRED = ['package/package.json', 'package/README.md', 'package/LICENSE', 'package/dist/cli.js'];

/** File names that have no business being published. */
/**
 * Each rule carries a `sample`: a file name it must reject. The self-test packs
 * the real tarball with that file added and requires the gate to refuse it, so
 * a rule added here is a case added there - and a rule whose sample its own
 * predicate accepts is a refusal to run, not a quiet pass.
 */
export const FORBIDDEN_NAMES = [
    { label: 'source map', sample: 'dist/cli.js.map', test: name => name.endsWith('.map') },
    { label: 'TypeScript source', sample: 'dist/cli.orig.ts', test: name => name.endsWith('.ts') && !name.endsWith('.d.ts') },
    { label: 'environment file', sample: '.env', test: name => /(^|\/)\.env/u.test(name) },
    {
        label: 'test file',
        sample: 'test/smoke.test.js',
        test: name => /(^|\/)(test|tests|__tests__)(\/|$)/u.test(name) || /\.test\.[cm]?[jt]s$/u.test(name)
    },
    { label: 'fixture', sample: 'fixtures/sample.json', test: name => /(^|\/)(fixtures?|data)(\/|$)/u.test(name) },
    { label: 'build config', sample: 'tsconfig.json', test: name => /(^|\/)tsconfig[^/]*\.json$/u.test(name) },
    { label: 'CI workflow', sample: '.github/workflows/ci.yml', test: name => name.includes('.github/') },
    {
        label: 'lockfile',
        sample: 'package-lock.json',
        test: name => /(^|\/)(package-lock\.json|npm-shrinkwrap\.json)$/u.test(name)
    },
    { label: 'bundled dependency tree', sample: 'node_modules/helper/index.js', test: name => name.includes('node_modules/') },
    {
        label: 'native build script (node-gyp runs it on install)',
        sample: 'binding.gyp',
        test: name => /(^|\/)binding\.gyp$/u.test(name)
    }
];

/**
 * Scripts npm may run without the user asking for them by name. Anything in
 * here is remote code execution on somebody else's machine, so the published
 * manifest may not carry one - not even ours.
 */
export const AUTO_RUN_SCRIPTS = new Set([
    'preinstall',
    'install',
    'postinstall',
    'preuninstall',
    'uninstall',
    'postuninstall',
    'prepublish',
    'prepublishOnly',
    'postpublish',
    'publish',
    'preprepare',
    'prepare',
    'postprepare',
    'prepack',
    'postpack',
    'preversion',
    'version',
    'postversion',
    'dependencies'
]);

/**
 * A dependency npm resolves from the registry by semver. Anything else - a git
 * URL, a tarball URL, `file:`, `link:`, `portal:`, `workspace:`, a
 * `user/repo` shorthand - can point anywhere, including at the private
 * repository, and is refused whatever it is called.
 */
const REGISTRY_RANGE = /^(?:\*|latest|(?:npm:@?[^@/]+(?:\/[^@]+)?@)?[\sv^~><=|.\d*x[\]()-]*[\d*x][\s\w.+^~><=|*-]*)$/u;

/**
 * What a dependency spec actually asks npm to install.
 *
 * `"mcp-helper": "npm:@viafrei/mcp@^1.0.0"` is a registry range by every test
 * that looks at the spec's shape, and the key has no `@viafrei/` in it, so a
 * check on the NAME sees an innocent dependency called `mcp-helper` and a check
 * on the SPEC sees a semver range. The alias is the point: it is the supported
 * way to install one package under another name. So the alias is resolved and
 * the scope rule is applied to what it resolves TO - which is what this
 * check's own description claimed it did.
 */
function resolveSpec(name, spec) {
    const alias = /^npm:(@[^/@]+\/[^@]+|[^@][^@]*)(?:@(.*))?$/u.exec(spec);
    if (alias === null) {
        return { name, range: spec, aliased: false };
    }
    return { name: alias[1] ?? '', range: alias[2] ?? '*', aliased: true };
}

/** The scope that carries the closed platform. Never a dependency, under any name. */
const PRIVATE_SCOPE = '@viafrei/';

const findings = [];
const note = message => {
    process.stdout.write(`${message}\n`);
};
const fail = (check, detail) => {
    findings.push(`${check}: ${detail}`);
};

const extraTokenHashes = new Set(
    (process.env.VF_EXTRA_TOKEN_HASHES ?? '')
        .split(',')
        .map(entry => entry.trim())
        .filter(entry => entry !== '')
);

function listFiles(directory) {
    const out = [];
    const walk = current => {
        for (const entry of readdirSync(current, { withFileTypes: true })) {
            const full = join(current, entry.name);
            if (entry.isDirectory()) {
                walk(full);
            } else if (entry.isFile()) {
                out.push(full);
            }
        }
    };
    walk(directory);
    return out.sort();
}

function checkManifest(manifest) {
    // --- lifecycle scripts ------------------------------------------------
    const scripts = manifest.scripts ?? {};
    const names = Object.keys(scripts);
    // The COUNT, not the names. A script key is arbitrary text from the
    // manifest under test, and this line goes into a public CI log. The names
    // that matter are the ones the next loop turns into findings, and those
    // are members of AUTO_RUN_SCRIPTS - a list published a few lines above in
    // this same file, so naming one discloses nothing and is what makes the
    // finding actionable.
    note(`gate: published manifest declares ${names.length} script(s)`);
    for (const name of names) {
        if (AUTO_RUN_SCRIPTS.has(name)) {
            fail('lifecycle script', `the published manifest declares "${name}" - npm runs that by itself, on the machine that installs this`);
        }
    }
    if (manifest.gypfile === true) {
        fail('lifecycle script', 'the published manifest sets gypfile, which makes npm run node-gyp on install');
    }

    // --- dependencies, judged by what they resolve to ----------------------
    const fields = ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies'];
    for (const field of fields) {
        for (const [name, spec] of Object.entries(manifest[field] ?? {})) {
            // A dependency key and a dependency spec are both arbitrary text,
            // and a spec is very often a URL - the private repository's own
            // git URL is precisely what check 5 exists to catch. Printing
            // either one in a finding republishes it in a public CI log, which
            // is the thing this gate is for. Length and hash prefix; the
            // manifest is two commands away for anyone entitled to read it.
            const shown = `${field} entry ${opaque(name, RULES)}, spec ${opaque(String(spec), RULES)}`;
            const resolved = resolveSpec(name, String(spec));
            // Lower-cased on both sides: npm treats package names as
            // lower-case, so an upper-case spelling of the scope is the same
            // dependency wearing a hat.
            if (name.toLowerCase().startsWith(PRIVATE_SCOPE) || resolved.name.toLowerCase().startsWith(PRIVATE_SCOPE)) {
                const how = resolved.aliased ? ' - through an npm: alias, and' : ' -';
                fail('dependencies', `${shown}${how} that scope carries the platform`);
                continue;
            }
            if (!REGISTRY_RANGE.test(resolved.range)) {
                fail(
                    'dependencies',
                    `${shown} is not a registry semver range - it resolves to wherever that points, which a name check cannot see`
                );
            }
        }
    }
    const bundled = manifest.bundleDependencies ?? manifest.bundledDependencies ?? [];
    if (Array.isArray(bundled) && bundled.length > 0) {
        fail('dependencies', `bundleDependencies ships code inside the tarball: ${bundled.length} package(s)`);
    }
    const dependencies = Object.keys(manifest.dependencies ?? {});
    note(`gate: ${dependencies.length} runtime dependenc${dependencies.length === 1 ? 'y' : 'ies'} declared`);
}

function main() {
    const reason = unrunnable();
    if (reason !== undefined) {
        note(`gate: CANNOT RUN - ${reason}`);
        note('gate: this is a failure, not a pass: a gate that cannot look has not looked');
        return 2;
    }
    const given = process.argv[2];
    const workspace = mkdtempSync(join(tmpdir(), 'viafrei-tarball-'));
    let tarball;

    try {
        if (given !== undefined) {
            tarball = resolve(given);
            note(`gate: checking the tarball it was given: ${tarball}`);
        } else {
            // Built explicitly, because the published manifest may not carry a
            // `prepack` script to do it - see the lifecycle check below.
            note('gate: building, then packing…');
            execFileSync('npm', ['run', 'build'], { cwd: ROOT, stdio: ['ignore', 'ignore', 'inherit'] });
            const packed = execFileSync('npm', ['pack', '--json', '--pack-destination', workspace], {
                cwd: ROOT,
                encoding: 'utf8',
                stdio: ['ignore', 'pipe', 'inherit']
            });
            const parsed = JSON.parse(packed);
            if (!Array.isArray(parsed) || parsed.length !== 1 || typeof parsed[0].filename !== 'string') {
                note('gate: npm pack did not report exactly one tarball - refusing to guess');
                return 2;
            }
            tarball = join(workspace, parsed[0].filename);
            note(`gate: packed ${parsed[0].filename} (${parsed[0].size} bytes, ${parsed[0].entryCount} entries)`);
        }

        statSync(tarball);

        const unpacked = join(workspace, 'unpacked');
        execFileSync('mkdir', ['-p', unpacked]);
        execFileSync('tar', ['-xzf', tarball, '-C', unpacked]);

        const files = listFiles(unpacked).map(path => relative(unpacked, path));
        if (files.length === 0) {
            note('gate: the tarball is empty - nothing was checked, which is a failure');
            return 2;
        }
        note(`gate: ${files.length} files in the tarball`);
        for (const file of files) {
            // A path is a LOCATION, and a location is the one thing a finding
            // is always allowed to say - except that a path can also carry a
            // private name in it (`dist/<name>.js`), which nothing here read
            // until now, because the scanners read contents and not names.
            // safeString() withholds a path that does; scanFile() turns the
            // same condition into a finding of its own.
            note(`  - ${safeString(file, RULES, extraTokenHashes)}`);
        }

        // --- check 1: it is actually the package, and only the package -------
        for (const required of REQUIRED) {
            if (!files.includes(required)) {
                fail('contents', `${required} is missing from the tarball`);
            }
        }
        for (const file of files) {
            for (const rule of FORBIDDEN_NAMES) {
                if (rule.test(file)) {
                    fail('file name', `${safeString(file, RULES, extraTokenHashes)} is a ${rule.label} and must not be published`);
                }
            }
        }

        // --- checks 4 and 5: the manifest ------------------------------------
        checkManifest(JSON.parse(readFileSync(join(unpacked, 'package/package.json'), 'utf8')));

        // --- checks 2 and 3: what the files actually contain ------------------
        //
        // The embedded-source rules apply to shipped code, not to prose: the
        // changelog names the three patterns the gate looks for, and a document
        // that says "sourceMappingURL" is not a document that ships sources.
        // Everything else applies to every file - a leak in a README is still a
        // leak.
        note(
            `gate: scanning ${files.length} files as plaintext, base64, hex, percent-encoding, JavaScript escapes and concatenated literals`
        );
        note('gate: a name is looked for across every separator, at camel-case boundaries, inside an unbroken run of letters and digits, and in the file path as well as the contents');
        note(`gate: cannot see ${blindSpots(RULES).join('; ')}`);
        for (const file of files) {
            const isProse = file.endsWith('.md');
            const patterns = isProse ? RULES.tarballPatterns : [...RULES.embeddedSourcePatterns, ...RULES.tarballPatterns];
            scanFile({
                label: file,
                text: readFileSync(join(unpacked, file), 'utf8'),
                patterns,
                rules: RULES,
                extraTokenHashes,
                // The finding's own kind, not a guess from it. Every kind that
                // was not `pattern` used to be reported as "private name", so a
                // number finding was labelled as a name - the one thing a
                // finding line has to get right is what it is.
                onFinding: finding => fail(finding.kind === 'pattern' ? 'content' : finding.kind, `${finding.where} ${finding.detail}`)
            });
        }

        if (findings.length > 0) {
            note('');
            note(`gate: FAIL - ${findings.length} finding${findings.length === 1 ? '' : 's'}`);
            for (const finding of findings) {
                note(`  ! ${finding}`);
            }
            return 1;
        }

        note('');
        note('gate: PASS - required files only, no lifecycle script, every dependency a registry range, no embedded sources, no platform content');
        return 0;
    } catch (error) {
        // Through the same door as every other uncontrolled string. This used
        // to print the message raw while the sweep refused to print git's at
        // all - two files, two rules, one of them wrong.
        note(`gate: could not run: ${safeMessage(error, RULES, extraTokenHashes)}`);
        return 2;
    } finally {
        rmSync(workspace, { recursive: true, force: true });
    }
}

/**
 * Is this file the program, or is it being imported?
 *
 * Through realpath on BOTH sides, which is not fussiness. `import.meta.url` is
 * already resolved through symlinks and `process.argv[1]` is not, so running
 * this file by a path with a symlinked component - every `mkdtemp` directory
 * on macOS has one, `/var` -> `/private/var` - made the comparison false, and
 * the gate then exited **0 having checked nothing at all**, silently. A gate
 * that no-ops and reports success is the failure this whole file exists to
 * prevent; it is not allowed to be true of the gate itself.
 */
function invokedDirectly() {
    if (process.argv[1] === undefined) {
        return false;
    }
    const real = path => {
        try {
            return realpathSync(path);
        } catch {
            return path;
        }
    };
    return pathToFileURL(real(fileURLToPath(import.meta.url))).href === pathToFileURL(real(process.argv[1])).href;
}

if (invokedDirectly()) {
    process.exit(main());
}

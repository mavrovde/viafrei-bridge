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
import { mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { blindSpots, loadRules, scanFile } from './rules.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const RULES = loadRules(ROOT);

/** Files that must be in the tarball for it to be the package at all. */
const REQUIRED = ['package/package.json', 'package/README.md', 'package/LICENSE', 'package/dist/cli.js'];

/** File names that have no business being published. */
const FORBIDDEN_NAMES = [
    { label: 'source map', test: name => name.endsWith('.map') },
    { label: 'TypeScript source', test: name => name.endsWith('.ts') && !name.endsWith('.d.ts') },
    { label: 'environment file', test: name => /(^|\/)\.env/u.test(name) },
    { label: 'test file', test: name => /(^|\/)(test|tests|__tests__)(\/|$)/u.test(name) || /\.test\.[cm]?[jt]s$/u.test(name) },
    { label: 'fixture', test: name => /(^|\/)(fixtures?|data)(\/|$)/u.test(name) },
    { label: 'build config', test: name => /(^|\/)tsconfig[^/]*\.json$/u.test(name) },
    { label: 'CI workflow', test: name => name.includes('.github/') },
    { label: 'lockfile', test: name => /(^|\/)(package-lock\.json|npm-shrinkwrap\.json)$/u.test(name) },
    { label: 'bundled dependency tree', test: name => name.includes('node_modules/') },
    { label: 'native build script (node-gyp runs it on install)', test: name => /(^|\/)binding\.gyp$/u.test(name) }
];

/**
 * Scripts npm may run without the user asking for them by name. Anything in
 * here is remote code execution on somebody else's machine, so the published
 * manifest may not carry one - not even ours.
 */
const AUTO_RUN_SCRIPTS = new Set([
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
    note(`gate: published manifest declares ${names.length === 0 ? 'no scripts' : `scripts: ${names.join(', ')}`}`);
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
            const shown = `${field} ${name}@${String(spec)}`;
            if (name.startsWith('@viafrei/')) {
                fail('dependencies', `${shown} - that scope carries the platform`);
                continue;
            }
            if (!REGISTRY_RANGE.test(String(spec))) {
                fail(
                    'dependencies',
                    `${shown} is not a registry semver range - it resolves to wherever that points, which a name check cannot see`
                );
            }
        }
    }
    const bundled = manifest.bundleDependencies ?? manifest.bundledDependencies ?? [];
    if (Array.isArray(bundled) && bundled.length > 0) {
        fail('dependencies', `bundleDependencies ships code inside the tarball: ${bundled.join(', ')}`);
    }
    const dependencies = Object.entries(manifest.dependencies ?? {}).map(([name, spec]) => `${name}@${String(spec)}`);
    note(`gate: dependencies = ${dependencies.join(', ') || '(none)'}`);
}

function main() {
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
            note(`  - ${file}`);
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
                    fail('file name', `${file} is a ${rule.label} and must not be published`);
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
        note(`gate: cannot see ${blindSpots().join('; ')}`);
        for (const file of files) {
            const isProse = file.endsWith('.md');
            const patterns = isProse ? RULES.tarballPatterns : [...RULES.embeddedSourcePatterns, ...RULES.tarballPatterns];
            scanFile({
                label: file,
                text: readFileSync(join(unpacked, file), 'utf8'),
                patterns,
                rules: RULES,
                extraTokenHashes,
                onFinding: finding => fail(finding.kind === 'pattern' ? 'content' : 'private name', `${finding.where} ${finding.detail}`)
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
        note(`gate: could not run: ${error instanceof Error ? error.message : String(error)}`);
        return 2;
    } finally {
        rmSync(workspace, { recursive: true, force: true });
    }
}

process.exit(main());

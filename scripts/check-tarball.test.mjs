#!/usr/bin/env node
/**
 * Self-test for the publish-hygiene gate.
 *
 * A gate nobody has seen fail is not known to work. This packs the real
 * tarball, checks that the gate accepts it, then poisons a copy in each of the
 * ways the gate exists to catch and checks that it is rejected - naming the
 * finding, so a case cannot pass by failing for the wrong reason.
 *
 * Three of these cases are here because a reviewer got them past the previous
 * gate, which exited 0 and printed `gate: PASS`:
 *
 *   - a `postinstall` in the published manifest (remote code execution on
 *     every machine that runs `npm install`),
 *   - a dependency on the private repository under a name with no `@viafrei/`
 *     in it (`git+ssh://…`), because the check was on the NAME,
 *   - a private name base64-encoded inside `dist/cli.js`, because the scan
 *     only ever read plaintext.
 *
 * Two rules about what this file may contain, both load-bearing:
 *
 *   - The poison strings for the generic patterns are decoded from the
 *     `sample` field of `scripts/rules.json`, so this file never spells out a
 *     string it forbids and a rule added there is a case added here.
 *   - No private name appears here in any form. The private-name cases invent
 *     a random token at run time, hand its salted hash to the gate through
 *     `VF_EXTRA_TOKEN_HASHES`, and hide the token in the tarball. That proves
 *     the hashed path and every decoding without a real name - or a stand-in
 *     for one - ever being written down in a public repository.
 */
import { execFileSync } from 'node:child_process';
import { appendFileSync, cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { hashToken, loadRules } from './rules.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const GATE = join(ROOT, 'scripts/check-tarball.mjs');
const RULES = loadRules(ROOT);

const workspace = mkdtempSync(join(tmpdir(), 'viafrei-gate-test-'));
let failures = 0;
let cases = 0;
const log = message => {
    process.stdout.write(`${message}\n`);
};

/**
 * A name nobody has ever used, invented now, so nothing private is written down.
 *
 * The length matters and used to be wrong here. This test invented a 20-letter
 * token, which is longer than every name on the real list (4 to 15 characters)
 * - so the encoded cases passed while the same encodings could not have caught
 * a real name. Tokens are now as short as the shortest rule and as ordinary as
 * a middling one.
 */
function inventToken(length) {
    const letters = 'abcdefghijklmnopqrstuvwxyz';
    let token = '';
    while (token.length < length) {
        token += letters[Math.floor(Math.random() * letters.length)];
    }
    return token;
}

const SECRET = inventToken(11);
const SECRET_HASH = hashToken(RULES.salt, SECRET);
const withSecret = { ...process.env, VF_EXTRA_TOKEN_HASHES: SECRET_HASH };

/** The shortest name the rules claim to cover - the hardest case to encode. */
const SHORTEST = inventToken(RULES.minTokenLength);
const SHORTEST_HASH = hashToken(RULES.salt, SHORTEST);
const withShortest = { ...process.env, VF_EXTRA_TOKEN_HASHES: SHORTEST_HASH };

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

/** Unpack the clean tarball, let `poison` edit it, repack. */
function poisonedTarball(name, poison) {
    const directory = join(workspace, `poison-${name}`);
    cpSync(join(workspace, 'clean'), directory, { recursive: true });
    poison(join(directory, 'package'));
    const tarball = join(workspace, `poison-${name}.tgz`);
    execFileSync('tar', ['-czf', tarball, '-C', directory, 'package']);
    return tarball;
}

function expectFail(name, expectation, poison, env = process.env) {
    cases += 1;
    const result = runGate(poisonedTarball(name, poison), env);
    const caught = result.code === 1 && new RegExp(expectation, 'u').test(result.stdout);
    if (caught) {
        log(`  PASS  the gate rejected "${name}" (exit ${result.code})`);
        for (const line of result.stdout.split('\n').filter(entry => entry.trim().startsWith('!'))) {
            log(`        ${line.trim()}`);
        }
    } else {
        failures += 1;
        log(`  FAIL  the gate ACCEPTED "${name}" (exit ${result.code}) - it would have shipped`);
        log(result.stdout);
    }
}

function editManifest(directory, edit) {
    const path = join(directory, 'package.json');
    const manifest = JSON.parse(readFileSync(path, 'utf8'));
    edit(manifest);
    writeFileSync(path, JSON.stringify(manifest, null, 2));
}

try {
    log('gate self-test');
    log(`  (private-name cases use invented tokens of ${SECRET.length} and ${SHORTEST.length} characters, new every run)`);
    log(`  (the real rules are ${RULES.minTokenLength}-${RULES.maxTokenLength} characters, so a longer stand-in would prove nothing)`);
    log('');

    const clean = pack();
    mkdirSync(join(workspace, 'clean'), { recursive: true });
    execFileSync('tar', ['-xzf', clean, '-C', join(workspace, 'clean')]);

    cases += 1;
    const cleanResult = runGate(clean);
    if (cleanResult.code === 0) {
        log('  PASS  the gate accepted the real tarball');
    } else {
        failures += 1;
        log(`  FAIL  the gate rejected the real tarball (exit ${cleanResult.code})`);
        log(cleanResult.stdout);
    }

    // --- the three the reviewer got past the previous gate --------------------

    expectFail('a-postinstall-script', 'lifecycle script.*postinstall', directory => {
        editManifest(directory, manifest => {
            manifest.scripts = { ...manifest.scripts, postinstall: 'node -e "process.exit(0)"' };
        });
    });

    expectFail('the-private-repo-under-another-name', 'dependencies.*not a registry semver range', directory => {
        editManifest(directory, manifest => {
            manifest.dependencies = { ...manifest.dependencies, 'vf-platform': 'git+ssh://git@github.com/example/example.git#main' };
        });
    });

    expectFail(
        'a-private-name-in-base64',
        'private name.*as base64',
        directory => {
            appendFileSync(join(directory, 'dist/cli.js'), `\nconst blob = "${Buffer.from(SECRET).toString('base64')}";\n`);
        },
        withSecret
    );

    expectFail(
        'the-shortest-name-there-is-in-base64',
        'private name.*as base64',
        directory => {
            appendFileSync(join(directory, 'dist/index.js'), `\nconst blob = "${Buffer.from(SHORTEST).toString('base64')}";\n`);
        },
        withShortest
    );

    expectFail(
        'the-shortest-name-there-is-in-hex',
        'private name.*as hex',
        directory => {
            appendFileSync(join(directory, 'dist/index.js'), `\nconst blob = "${Buffer.from(SHORTEST).toString('hex')}";\n`);
        },
        withShortest
    );

    expectFail('an-npm-alias-onto-the-private-scope', 'dependencies.*@viafrei/', directory => {
        editManifest(directory, manifest => {
            manifest.dependencies = { ...manifest.dependencies, 'mcp-helper': 'npm:@viafrei/mcp@^1.0.0' };
        });
    });

    // --- the rest of the lifecycle and dependency surface ---------------------

    expectFail('a-prepare-script', 'lifecycle script.*prepare', directory => {
        editManifest(directory, manifest => {
            manifest.scripts = { ...manifest.scripts, prepare: 'node ./anything.js' };
        });
    });

    expectFail('a-gypfile-manifest', 'lifecycle script.*gypfile', directory => {
        editManifest(directory, manifest => {
            manifest.gypfile = true;
        });
    });

    expectFail('a-viafrei-dependency', 'dependencies.*@viafrei/', directory => {
        editManifest(directory, manifest => {
            manifest.dependencies = { ...manifest.dependencies, '@viafrei/mcp': '*' };
        });
    });

    expectFail('a-tarball-url-dependency', 'dependencies.*not a registry semver range', directory => {
        editManifest(directory, manifest => {
            manifest.dependencies = { ...manifest.dependencies, helper: 'https://example.invalid/helper.tgz' };
        });
    });

    expectFail('a-file-path-dependency', 'dependencies.*not a registry semver range', directory => {
        editManifest(directory, manifest => {
            manifest.dependencies = { ...manifest.dependencies, helper: 'file:../helper' };
        });
    });

    expectFail('a-bundled-dependency', 'dependencies.*bundleDependencies', directory => {
        editManifest(directory, manifest => {
            manifest.bundleDependencies = ['helper'];
        });
    });

    // --- what the files contain, in every encoding the scanner claims ---------

    for (const rule of RULES.embeddedSourcePatterns) {
        expectFail(`embedded-${rule.label.replace(/\s+/gu, '-')}`, 'embedded (original )?sources|source map link|inline source comment', directory => {
            appendFileSync(join(directory, 'dist/cli.js'), `\n${rule.sample}\n`);
        });
    }

    for (const rule of RULES.tarballPatterns) {
        expectFail(`content-${rule.label.replace(/\s+/gu, '-')}`, 'content:', directory => {
            appendFileSync(join(directory, 'dist/index.js'), `\n// ${rule.sample}\n`);
        });
    }

    expectFail(
        'a-private-name-inside-a-longer-identifier',
        'private name.*as plaintext',
        directory => {
            appendFileSync(join(directory, 'dist/index.js'), `\nconst my_${SECRET}_backup = 1;\n`);
        },
        withSecret
    );

    expectFail(
        'a-private-name-in-hex',
        'private name.*as hex',
        directory => {
            appendFileSync(join(directory, 'dist/cli.js'), `\nconst blob = "${Buffer.from(SECRET).toString('hex')}";\n`);
        },
        withSecret
    );

    expectFail(
        'a-private-name-percent-encoded',
        'private name.*as percent',
        directory => {
            appendFileSync(join(directory, 'dist/cli.js'), `\nconst blob = "${encodeURIComponent(SECRET).replace(/[a-z]/gu, c => `%${c.charCodeAt(0).toString(16)}`)}";\n`);
        },
        withSecret
    );

    expectFail(
        'a-private-name-in-js-escapes',
        'private name.*as js-escape',
        directory => {
            const escaped = [...SECRET].map(character => `\\x${character.charCodeAt(0).toString(16)}`).join('');
            appendFileSync(join(directory, 'dist/cli.js'), `\nconst blob = "${escaped}";\n`);
        },
        withSecret
    );

    expectFail(
        'a-private-name-split-across-literals',
        'private name.*as concatenated literals',
        directory => {
            const half = Math.floor(SECRET.length / 2);
            appendFileSync(join(directory, 'dist/cli.js'), `\nconst blob = "${SECRET.slice(0, half)}" + "${SECRET.slice(half)}";\n`);
        },
        withSecret
    );

    // --- file names -----------------------------------------------------------

    expectFail('a-source-map-file', 'file name', directory => {
        writeFileSync(join(directory, 'dist/cli.js.map'), '{"version":3}');
    });

    expectFail('the-typescript-source', 'file name', directory => {
        writeFileSync(join(directory, 'dist/cli.orig.ts'), 'export const x = 1;\n');
    });

    expectFail('a-bundled-node-modules-tree', 'file name', directory => {
        mkdirSync(join(directory, 'node_modules/helper'), { recursive: true });
        writeFileSync(join(directory, 'node_modules/helper/index.js'), 'module.exports = 1;\n');
    });

    expectFail('a-native-build-script', 'file name', directory => {
        writeFileSync(join(directory, 'binding.gyp'), '{"targets":[]}\n');
    });

    expectFail('a-missing-readme', 'contents', directory => {
        unlinkSync(join(directory, 'README.md'));
    });

    log('');
    if (failures === 0) {
        log(`gate self-test: PASS - ${cases} cases, every poisoned tarball rejected, the real one accepted`);
    } else {
        log(`gate self-test: FAIL - ${failures} of ${cases} case(s)`);
    }
} finally {
    rmSync(workspace, { recursive: true, force: true });
}

process.exit(failures === 0 ? 0 : 1);

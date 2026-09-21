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
 * one per required file, one per content pattern, one for the numbers rule in
 * plaintext and in base64, and one per encoding at each alignment. A rule added
 * to the gate is a case added here; a rule list that goes empty is a REFUSAL to
 * run rather than a smaller, quieter pass. That was a real hole: this file used
 * to exit on `failures === 0` whatever the number of cases, so emptying a list
 * in `rules.json` deleted six cases and still printed PASS.
 *
 * It also mutates the RULESET itself, once per refusal the rules can produce,
 * and runs each mutation against every leg it applies to - the gate, the sweep,
 * and the sweep reading history - with a clean control for each. That section
 * exists because the numbers rule, which
 * carries all the numeric coverage, could be made inert by a 20-25 digit
 * window while both legs exited 0 and printed PASS, and none of the 67 cases
 * here would have noticed: not one of them was a number.
 *
 * What it does NOT do, said here rather than implied: it holds no baseline
 * from an earlier run. It asserts that every case it planned actually ran, and
 * that the lists it derives cases from are not empty. A rule list that merely
 * got shorter still produces a shorter plan, and that plan still passes.
 *
 * Nothing private is written down here, in any form. The private-name cases
 * invent a token at run time, hand its salted hash to the gate through
 * `VF_EXTRA_TOKEN_HASHES`, and hide it in the tarball; the number cases invent
 * a value outside the allow-list at run time; the poison strings for the
 * content patterns are decoded from the rules' own `sample` fields.
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

/**
 * A number the rules forbid, invented here, derived from `rules.numbers`.
 *
 * The numbers rule was the one class the 67 cases never exercised - which is
 * why a 20-25 digit window could make it inert while both legs printed PASS
 * and nothing noticed. It is exercised now, and like the name cases it is
 * invented at run time: the shortest width the window covers, not on the
 * allow-list, so this file spells out no value of its own.
 */
function inventNumber() {
    const digits = RULES.numbers.minDigits;
    for (let attempt = 0; attempt < 10_000; attempt += 1) {
        let value = String(1 + Math.floor(Math.random() * 9));
        while (value.length < digits) {
            value += String(Math.floor(Math.random() * 10));
        }
        if (!RULES.numbers.allowed.has(value)) {
            return value;
        }
    }
    return undefined;
}

const FORBIDDEN_NUMBER = inventNumber();
if (FORBIDDEN_NUMBER === undefined) {
    refuse(`no ${RULES.numbers.minDigits}-digit number is outside numbers.allowed, so the numbers rule cannot be exercised`);
}

/**
 * A number of the same width that is in no tracked file.
 *
 * Used to prove the sweep refuses an allow-list entry that occurs nowhere -
 * the round-4 blocker, which was one entry kept only to silence a finding
 * about a value that had been taken out of the tree. Read from the tree rather
 * than assumed, so the case cannot quietly stop being about anything.
 */
function inventAbsentNumber() {
    const tracked = execFileSync('git', ['-C', ROOT, 'ls-files', '-z'], { encoding: 'utf8' }).split('\0').filter(entry => entry !== '');
    const corpus = tracked
        .map(file => {
            try {
                return readFileSync(join(ROOT, file), 'utf8');
            } catch {
                return '';
            }
        })
        .join('\n');
    for (let attempt = 0; attempt < 10_000; attempt += 1) {
        const value = inventNumber();
        if (value !== undefined && !new RegExp(`(?<![0-9])${value}(?![0-9])`, 'u').test(corpus)) {
            return value;
        }
    }
    return undefined;
}

const ABSENT_NUMBER = inventAbsentNumber();
if (ABSENT_NUMBER === undefined) {
    refuse(`every ${RULES.numbers.minDigits}-digit number occurs in this tree, so the allow-list occurrence rule cannot be exercised`);
}

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
/**
 * Letters either side of the name, for the cases that test the tokeniser
 * rather than a decoder. `GLUE_LEFT`/`GLUE_RIGHT` size a run to EXACTLY the
 * longest name the rules cover, around the shortest one.
 */
const GLUE = 'Wxyz';
const GLUE_LEFT = Math.floor((RULES.maxTokenLength - SHORTEST.length) / 2);
const GLUE_RIGHT = RULES.maxTokenLength - SHORTEST.length - GLUE_LEFT;
if (GLUE_LEFT < 1 || GLUE_RIGHT < 1) {
    refuse('the shortest and the longest name are too close together to glue a name inside a run of exactly the longest length');
}

// ---------------------------------------------------------------------------
// The plan, built from the gate's own rules.
// ---------------------------------------------------------------------------

const plan = [];
/**
 * `token`, when given, is a string the run's output may NEVER contain.
 *
 * The expectation says what the gate must notice; this says what it must not
 * say while noticing it. Round 6 found a finding that printed the path it was
 * complaining about, in the branch that only runs when a name is really there,
 * and no positive expectation would ever have caught that - a regex looking
 * for "private name" matches a line that leaks just as happily as one that
 * does not. So the invented stand-in is checked for directly, in every case
 * that has one.
 */
const add = (kind, name, expectation, poison, env = process.env, codes = [1], token = undefined) => {
    plan.push({ kind, name, expectation, poison, env, codes, token });
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
    },
    // Glued: no separator, no case change, nothing for a tokeniser that cuts
    // at boundaries to cut at. Round 6 measured this at 0 of 60 placements
    // with lower-case filler and 20 of 60 with upper-case, and round 4 scored
    // the same, so it had never worked. Both fillers are kept because they
    // failed for different reasons, and a fix for one is not a fix for the
    // other.
    {
        name: 'plaintext-glued-into-a-lower-case-run',
        expectation: 'private name.*as plaintext',
        token: SECRET,
        build: token => `const blob = "${GLUE.toLowerCase()}${token}${GLUE.toLowerCase()}";`
    },
    {
        name: 'plaintext-glued-into-an-upper-case-run',
        expectation: 'private name.*as plaintext',
        token: SECRET,
        build: token => `const blob = "${GLUE.toUpperCase()}${token}${GLUE.toUpperCase()}";`
    },
    // The boundary the first attempt at that fix got wrong: it looked inside a
    // run only when the run was LONGER than the longest name, and a run of
    // exactly that length still holds a shorter name. Sized from the rules, so
    // it stays the boundary when the rules move.
    {
        name: 'plaintext-glued-into-a-run-of-exactly-the-longest-name',
        expectation: 'private name.*as plaintext',
        token: SHORTEST,
        build: token => `const blob = "${'w'.repeat(GLUE_LEFT)}${token}${'x'.repeat(GLUE_RIGHT)}";`
    }
);
if (ENCODING_CASES.length === 0) {
    refuse('no encoding cases');
}
// The numbers rule, in the plaintext view and in every decoding of it: it now
// carries all the numeric coverage, so it gets the same treatment the names
// get rather than none at all.
add('number', 'a-forbidden-number-in-plaintext', 'number:.*not on the allow-list', directory => {
    appendFileSync(join(directory, 'dist/cli.js'), `\nconst count = ${FORBIDDEN_NUMBER};\n`);
});
add('number', 'a-forbidden-number-in-base64', 'number:.*not on the allow-list', directory => {
    appendFileSync(join(directory, 'dist/cli.js'), `\nconst blob = "${b64(`${pad(2)} ${FORBIDDEN_NUMBER} ${pad(2)}`)}";\n`);
});
for (const entry of ENCODING_CASES) {
    add(
        'private name',
        entry.name,
        entry.expectation,
        directory => {
            appendFileSync(join(directory, 'dist/cli.js'), `\n${entry.build(entry.token)}\n`);
        },
        envFor(entry.token),
        [1],
        entry.token
    );
}

// --- the path itself, not the contents -------------------------------------
//
// A name in a FILE NAME was invisible until round 5 and then printed in the
// clear by the finding it raised until round 6. The file's contents are
// innocent here, so only the path can raise this, and the run has to say so
// without saying it.
add(
    'private name',
    'a-private-name-in-a-path',
    'private name.*is in this path',
    directory => {
        writeInto(directory, `dist/${SECRET}.js`, 'export const ok = 1;\n');
    },
    envFor(SECRET),
    [1],
    SECRET
);

// ---------------------------------------------------------------------------
// Ruleset cases: a rule that cannot match anything is a REFUSAL, in BOTH legs.
// ---------------------------------------------------------------------------
//
// Round 4 moved every numeric check into `numbers`, and `thresholds()` only
// type-checked its two ends. A window of 20-25 digits made the rule inert and
// both legs exited 0 and printed PASS - a gate with no input reporting
// success, which is the failure this project keeps rediscovering. These cases
// exist so that an inert rule is a test failure rather than the next
// reviewer's finding.
//
// The mutations are DERIVED from the live rules, not typed: the inert window
// is "just past the widest number the rules cover", so it moves when the rules
// move. Each is run against the gate AND against the sweep, because a leg that
// only refuses because its neighbour does is not a leg that refuses.
const RULESET_CASES = [
    {
        name: 'numbers-window-inert',
        expectation: 'fall outside the .*digit window',
        mutate: rules => {
            rules.numbers.minDigits = RULES.numbers.maxDigits + 1;
            rules.numbers.maxDigits = RULES.numbers.maxDigits + 6;
        }
    },
    {
        name: 'numbers-allow-list-emptied',
        expectation: 'numbers.allowed is empty',
        mutate: rules => {
            rules.numbers.allowed = [];
        }
    },
    {
        name: 'numbers-min-digits-zero',
        expectation: 'numbers.minDigits',
        mutate: rules => {
            rules.numbers.minDigits = 0;
        }
    },
    {
        name: 'numbers-max-below-min',
        expectation: 'numbers.maxDigits',
        mutate: rules => {
            rules.numbers.maxDigits = RULES.numbers.minDigits - 1;
        }
    },
    {
        name: 'numbers-digits-not-a-number',
        expectation: 'numbers.minDigits',
        mutate: rules => {
            rules.numbers.minDigits = '4';
        }
    },
    {
        name: 'token-hashes-emptied',
        expectation: 'no private-name hashes',
        mutate: rules => {
            rules.tokenHashes = [];
        }
    },
    {
        // The blocker itself, made impossible rather than documented: an
        // allow-list entry that is in no tracked file is a caption pointing at
        // a value somebody took out of the tree. Sweep only - the gate reads a
        // tarball, not a repository.
        name: 'an-allow-list-entry-that-is-in-no-file',
        expectation: 'occur in no tracked file',
        legs: ['sweep'],
        mutate: rules => {
            rules.numbers.allowed = [...rules.numbers.allowed, ABSENT_NUMBER];
        }
    },
    {
        // The sweep's own path handling, end to end. The gate has a case for
        // this in the tarball plan; the sweep has no VF_EXTRA_TOKEN_HASHES
        // channel, so its stand-in goes in through the ruleset instead, and
        // the file has to be TRACKED or the sweep would never look at it - an
        // untracked file would have made this case pass by reading nothing.
        name: 'a-private-name-in-a-tracked-path',
        expectation: 'private name.*is in this path',
        legs: ['sweep'],
        codes: [1],
        verdict: 'reported',
        token: SECRET,
        prepare: root => {
            writeFileSync(join(root, 'src', `${SECRET}.md`), 'nothing in here.\n');
            execFileSync('git', ['-C', root, 'add', join('src', `${SECRET}.md`)], { stdio: 'ignore' });
        },
        cleanup: root => {
            execFileSync('git', ['-C', root, 'rm', '-q', '-f', join('src', `${SECRET}.md`)], { stdio: 'ignore' });
        },
        mutate: rules => {
            rules.tokenHashes = [...rules.tokenHashes, hashToken(RULES.salt, SECRET)];
        }
    },
    {
        // A residue entry whose blob is gone is a FINDING, not a refusal, and
        // the difference is the point. A suppression that stops applying makes
        // the run louder, never quieter: everything it used to hide is now
        // reported. Nothing went unread, so "could not run" would be a lie
        // told by a run that had read every blob in the repository.
        name: 'a-history-residue-entry-for-a-blob-that-is-not-here',
        expectation: 'matched no blob in this history',
        legs: ['sweep --history'],
        codes: [1],
        verdict: 'reported',
        mutate: rules => {
            // Replaced, not appended: the throwaway repository has its own
            // history, so this repository's real residue blobs are not in it.
            rules.historyNumberResidue = [{ blob: 'f'.repeat(40), findings: 1 }];
        }
    }
];
/**
 * The legs, named once. `PLANNED` counts from this and the runner builds from
 * it, so the two cannot disagree - which is the defect being fixed three
 * paragraphs up, in miniature.
 */
const LEG_LABELS = ['gate', 'sweep', 'sweep --history'];
const DEFAULT_LEGS = ['gate', 'sweep'];
for (const entry of RULESET_CASES) {
    for (const label of entry.legs ?? DEFAULT_LEGS) {
        if (!LEG_LABELS.includes(label)) {
            refuse(`the ruleset case "${entry.name}" names a leg that does not exist, so it would run nowhere`);
        }
    }
}
if (RULESET_CASES.length === 0) {
    refuse('no ruleset cases');
}

function writeRuleset(root, mutate) {
    const rules = JSON.parse(readFileSync(join(ROOT, 'scripts/rules.json'), 'utf8'));
    mutate(rules);
    writeFileSync(join(root, 'scripts/rules.json'), JSON.stringify(rules, null, 2));
}

/** A scripts-only root: enough for the gate, which reads no repository. */
function buildGateRoot(workspace) {
    const root = join(workspace, 'ruleset-gate');
    mkdirSync(join(root, 'scripts'), { recursive: true });
    for (const file of ['rules.mjs', 'check-tarball.mjs', 'check-leaks.mjs', 'rules.json']) {
        cpSync(join(ROOT, 'scripts', file), join(root, 'scripts', file));
    }
    return root;
}

/**
 * A throwaway repository: the sweep reads one, and running it against a
 * scripts-only directory would refuse for the wrong reason - "not a git
 * repository" rather than "this rule cannot match". A case that passes for the
 * wrong reason proves nothing, so the scaffolding is a real repository and a
 * control run with the REAL rules has to come back clean.
 */
function buildSweepRepo(workspace) {
    const root = join(workspace, 'ruleset-sweep');
    mkdirSync(root, { recursive: true });
    for (const file of execFileSync('git', ['-C', ROOT, 'ls-files', '-z'], { encoding: 'utf8' }).split('\0').filter(entry => entry !== '')) {
        mkdirSync(dirname(join(root, file)), { recursive: true });
        cpSync(join(ROOT, file), join(root, file));
    }
    const env = {
        ...process.env,
        GIT_AUTHOR_NAME: 'gate self-test',
        GIT_AUTHOR_EMAIL: 'gate@example.invalid',
        GIT_COMMITTER_NAME: 'gate self-test',
        GIT_COMMITTER_EMAIL: 'gate@example.invalid'
    };
    for (const args of [['init', '-q'], ['add', '-A'], ['commit', '-q', '-m', 'throwaway']]) {
        execFileSync('git', ['-C', root, ...args], { stdio: 'ignore', env });
    }
    return root;
}

function runNode(script, args, env = process.env) {
    try {
        const stdout = execFileSync(process.execPath, [script, ...args], { encoding: 'utf8', env });
        return { code: 0, stdout };
    } catch (error) {
        return { code: error.status ?? -1, stdout: `${error.stdout ?? ''}${error.stderr ?? ''}` };
    }
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

const RULESET_RUNS = RULESET_CASES.reduce((total, entry) => total + (entry.legs ?? DEFAULT_LEGS).length, 0);
const LEG_COUNT = LEG_LABELS.length;
const PLANNED = plan.length + 1 + RULESET_RUNS + LEG_COUNT;

try {
    log('gate self-test');
    log(`  ${plan.length} poisoned tarballs, every one of them derived from a rule the gate reads`);
    log(`  ${RULESET_CASES.length} ruleset mutations over ${RULESET_RUNS} runs across ${LEG_COUNT} legs, plus one clean control per leg`);
    log(`  private-name cases use invented tokens of ${SHORTEST.length} and ${SECRET.length} characters, new every run`);
    log(`  (the rules are ${RULES.minTokenLength}-${RULES.maxTokenLength} characters, so a longer stand-in would prove nothing)`);
    log(`  the number case uses an invented ${RULES.numbers.minDigits}-digit value that is not on the allow-list, new every run`);
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
        const leaked = entry.token !== undefined && result.stdout.toLowerCase().includes(entry.token.toLowerCase());
        if (caught && !leaked) {
            log(`  PASS  rejected "${entry.name}" (${entry.kind})`);
        } else if (leaked) {
            failures += 1;
            // The output is deliberately NOT reprinted: it contains the thing
            // that must not be printed, and a self-test that echoes the leak
            // to prove there was one has published it as well.
            log(`  FAIL  "${entry.name}" (${entry.kind}) printed the ${entry.token.length}-character stand-in name in its own output`);
        } else {
            failures += 1;
            log(`  FAIL  ACCEPTED "${entry.name}" (${entry.kind}, exit ${result.code}) - it would have shipped`);
            log(result.stdout);
        }
    }

    // --- the ruleset, against both legs ------------------------------------
    const gateRoot = buildGateRoot(workspace);
    const sweepRepo = buildSweepRepo(workspace);
    const legs = [
        {
            label: LEG_LABELS[0],
            root: gateRoot,
            run: root => runNode(join(root, 'scripts/check-tarball.mjs'), [clean]),
            // The throwaway repository's history is its own single commit, so
            // this repository's residue blobs are not in it and the real list
            // would rightly refuse. The control declares that difference
            // instead of the case working around it.
            control: () => {}
        },
        {
            label: LEG_LABELS[1],
            root: sweepRepo,
            run: root => runNode(join(root, 'scripts/check-leaks.mjs'), []),
            control: () => {}
        },
        {
            label: LEG_LABELS[2],
            root: sweepRepo,
            run: root => runNode(join(root, 'scripts/check-leaks.mjs'), ['--history']),
            control: rules => {
                rules.historyNumberResidue = [];
            }
        }
    ];
    for (const leg of legs) {
        ran += 1;
        writeRuleset(leg.root, leg.control);
        const control = leg.run(leg.root);
        if (control.code === 0) {
            log(`  PASS  control: "${leg.label}" accepts the real ruleset in the throwaway root (exit 0)`);
        } else {
            failures += 1;
            log(`  FAIL  control: "${leg.label}" did not accept the real ruleset in the throwaway root (exit ${control.code})`);
            log(control.stdout);
        }
    }
    for (const entry of RULESET_CASES) {
        for (const leg of legs.filter(candidate => (entry.legs ?? DEFAULT_LEGS).includes(candidate.label))) {
            ran += 1;
            writeRuleset(leg.root, rules => {
                leg.control(rules);
                entry.mutate(rules);
            });
            if (entry.prepare !== undefined) {
                entry.prepare(leg.root);
            }
            const result = leg.run(leg.root);
            if (entry.cleanup !== undefined) {
                entry.cleanup(leg.root);
            }
            // Most of these are refusals (exit 2: the rule cannot match, so
            // the leg has not checked anything). One is a finding (exit 1),
            // and the case says which - a shared runner that assumed "2" would
            // have had the residue case silently renamed into the wrong class
            // to keep it passing.
            const codes = entry.codes ?? [2];
            const verdict = entry.verdict ?? 'refused';
            const caught = codes.includes(result.code) && new RegExp(entry.expectation, 'u').test(result.stdout);
            const leaked = entry.token !== undefined && result.stdout.toLowerCase().includes(entry.token.toLowerCase());
            if (caught && !leaked) {
                log(`  PASS  "${leg.label}" ${verdict} "${entry.name}" (exit ${result.code})`);
            } else if (leaked) {
                failures += 1;
                log(`  FAIL  "${leg.label}" printed the ${entry.token.length}-character stand-in name while handling "${entry.name}"`);
            } else {
                failures += 1;
                log(`  FAIL  "${leg.label}" did NOT ${verdict.replace(/ed$/u, '')} "${entry.name}" (exit ${result.code}, wanted ${codes.join(' or ')})`);
                log(result.stdout);
            }
        }
        for (const leg of legs) {
            writeRuleset(leg.root, leg.control);
        }
    }

    log('');
    if (ran !== PLANNED) {
        refuse(`${PLANNED} cases were planned and ${ran} ran`);
    }
    if (failures === 0) {
        log(
            `gate self-test: PASS - ${ran} cases (${plan.length} poisoned tarballs, 1 clean tarball, ${RULESET_RUNS} ruleset-mutation runs, ${LEG_COUNT} controls)`
        );
    } else {
        log(`gate self-test: FAIL - ${failures} of ${ran} case(s)`);
    }
} finally {
    rmSync(workspace, { recursive: true, force: true });
}

process.exit(failures === 0 ? 0 : 1);

#!/usr/bin/env node
/**
 * The API-reference generator's self-test.
 *
 * WHY IT EXISTS. Every other script in this repository that makes a claim has a
 * self-test; `gen-api-doc.mjs` did not, and its claims were being checked by hand —
 * the same six mutants, re-run from a terminal three times across three review
 * rounds. A check performed by remembering is not a check.
 *
 * It also exists because one specific defect got through everything else. The
 * generator's whitespace-flattening expression was rewritten to remove a
 * super-linear backtracking pattern, and the replacement was NOT equivalent: it
 * handled only spaces and tabs beside the newline, so a `\r\n` line ending left a
 * stray carriage return in the document. Nothing caught it. API.md regenerated
 * byte-identical, `--check` passed, every gate was green — because this snapshot
 * contains no CRLF. An output comparison can only speak about the input it was given,
 * which is why case 1 below compares the two EXPRESSIONS over inputs the snapshot
 * does not contain, rather than comparing two documents.
 *
 *   node scripts/gen-api-doc.test.mjs
 *
 * PRECONDITIONS, because a self-test that silently checks nothing is the failure it
 * exists to prevent:
 *   - the generator and the snapshot must both be readable, and the snapshot must
 *     parse and carry the four lists (a fixture that is not there is a failure, never
 *     an absence);
 *   - the differential case must actually EXERCISE the interesting inputs: it asserts
 *     that its alphabet produced at least one string on which the two expressions
 *     would disagree if the old bug were reinstated, so "they agree" cannot mean "I
 *     never tried anything hard";
 *   - every mutation case must FIND its anchor in the snapshot before mutating, so a
 *     renamed field turns the case red rather than making it a no-op.
 */

import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { missingFixtureImports } from './fixture-root.mjs';
import { flatten } from './flatten.mjs';
import { nodePath } from './tools.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
const GENERATOR = join(HERE, 'gen-api-doc.mjs');
const SNAPSHOT = join(ROOT, 'catalogue.json');
const TARGET = join(ROOT, 'API.md');

let passed = 0;
const failures = [];

function check(label, ok, detail = '') {
    if (ok) {
        passed += 1;
        console.log(`  PASS  ${label}`);
        return;
    }
    failures.push(`${label}${detail ? ` — ${detail}` : ''}`);
    console.log(`  FAIL  ${label}${detail ? ` — ${detail}` : ''}`);
}

function refuse(message) {
    console.error(`gen-api-doc self-test: ${message}`);
    process.exit(2);
}

// --- Preconditions ----------------------------------------------------------
let snapshot;
try {
    snapshot = JSON.parse(readFileSync(SNAPSHOT, 'utf8'));
} catch (error) {
    refuse(`cannot read or parse ${SNAPSHOT} — ${error.message}`);
}
for (const key of ['tools', 'resources', 'resourceTemplates', 'prompts']) {
    if (!Array.isArray(snapshot[key])) {
        refuse(`${SNAPSHOT} has no ${key} array, so the mutation cases below would prove nothing`);
    }
}
try {
    readFileSync(GENERATOR, 'utf8');
    readFileSync(TARGET, 'utf8');
} catch (error) {
    refuse(`cannot read the generator or API.md — ${error.message}`);
}
// The imported function must BE one. An import that silently resolves to `undefined`
// - a rename, a dropped `export` - is how case 1 would stop testing anything, and it
// replaces the old "cannot find the expression in the source" refusal.
if (typeof flatten !== 'function') {
    refuse('the generator does not export `flatten`, so case 1 would test nothing');
}

/**
 * Run the generator in a throwaway copy of the repository root, so no case can
 * disturb the working tree. Returns { status, stdout, stderr }.
 */
function runIn(directory, argv) {
    try {
        const stdout = execFileSync(nodePath(), [join(directory, 'scripts', 'gen-api-doc.mjs'), ...argv], {
            cwd: directory,
            encoding: 'utf8',
            stdio: ['ignore', 'pipe', 'pipe']
        });
        return { status: 0, stdout, stderr: '' };
    } catch (error) {
        return {
            status: error.status ?? 1,
            stdout: error.stdout ?? '',
            stderr: error.stderr ?? String(error.message)
        };
    }
}

/** A throwaway root holding the generator, the snapshot and API.md. */
function buildRoot() {
    const root = mkdtempSync(join(tmpdir(), 'gen-api-doc-test-'));
    mkdirSync(join(root, 'scripts'), { recursive: true });
    copyFileSync(GENERATOR, join(root, 'scripts', 'gen-api-doc.mjs'));
    copyFileSync(join(HERE, 'flatten.mjs'), join(root, 'scripts', 'flatten.mjs'));
    copyFileSync(SNAPSHOT, join(root, 'catalogue.json'));
    copyFileSync(TARGET, join(root, 'API.md'));
    // The copy list above is written by hand, and a hand-written list falls behind an
    // import: the copied generator would then die of ERR_MODULE_NOT_FOUND, which does
    // not read as "a file is missing" — it reads as whatever the case was measuring.
    // `missingFixtureImports` is the one implementation of that check in this
    // repository, shared with the other two self-tests rather than copied.
    const missing = missingFixtureImports(root);
    if (missing.length > 0) {
        refuse(
            `buildRoot() did not copy everything the generator imports: ${missing.join('; ')}. ` +
            'Add it to the copy list — every case below would otherwise fail for the wrong reason.'
        );
    }
    return root;
}

const roots = [];
function freshRoot() {
    const root = buildRoot();
    roots.push(root);
    return root;
}

// --- Case 1: the flattening function, against the expression it replaced -----
//
// This is the only case that can speak about inputs the snapshot does not contain,
// and the defect it exists for was invisible to every other check in the repository.
{
    // Every member is written as an ESCAPE. Two of them (NBSP and LINE SEPARATOR) were raw bytes, and a reader
    // with this file open read them as duplicate spaces and said so - which is the
    // whole problem: an invisible character is invisible to the next maintainer, and
    // to the editor or copy-paste that silently drops it.
    const ALPHABET = [' ', '\t', '\n', 'a', '\r', '\u00a0', '\f', '\v', '\u2028'];
    const flattenWith = (regex, value) => String(value).replace(regex, ' ').trim();
    // The function under test is IMPORTED, not scraped. Two earlier drafts read the
    // generator's source and rebuilt its regular expression — one with `eval`, one with
    // a two-group match — and both were fragile for the same reason: the thing tested
    // was a reconstruction of the thing that runs. It is also moot now, because the
    // generator no longer uses a regular expression here at all.
    const usingDeclared = value => flatten(value);
    const usingOriginal = value => flattenWith(/\s*\n\s*/gu, value);
    // The bug that SHIPPED, and its nearest wrong neighbour. Both are here so the
    // alphabet can be proved capable of separating them, rather than assumed to be:
    // the shipped bug is witnessed by a plain space, which says nothing about whether
    // the non-ASCII members of the alphabet are doing any work at all.
    const usingFirstAttempt = value => flattenWith(/[ \t]*\n[ \t\n]*/gu, value);
    const usingAsciiOnly = value => flattenWith(/[ \t\r\f\v]*\n[ \t\r\f\v\n]*/gu, value);

    const strings = [];
    const rec = (prefix, depth) => {
        if (depth === 0) { strings.push(prefix); return; }
        for (const ch of ALPHABET) rec(prefix + ch, depth - 1);
    };
    for (let len = 0; len <= 4; len += 1) rec('', len);
    for (let i = 0; i < 20_000; i += 1) {
        let s = '';
        const len = 1 + Math.floor(Math.random() * 25);
        for (let j = 0; j < len; j += 1) s += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
        strings.push(s);
    }

    const disagreements = strings.filter(s => usingDeclared(s) !== usingOriginal(s));
    const exposesOldBug = strings.filter(s => usingFirstAttempt(s) !== usingOriginal(s));
    const exposesAsciiOnly = strings.filter(s => usingAsciiOnly(s) !== usingOriginal(s));

    check(
        `the alphabet exposes the defect that shipped (precondition, ${exposesOldBug.length} witness(es))`,
        exposesOldBug.length > 0,
        'no input distinguishes the buggy expression, so agreement below would prove nothing'
    );
    // The check above is satisfied by a plain space, so on its own it says nothing
    // about whether the non-ASCII members of the alphabet are load-bearing. This one
    // requires the corpus to separate the NEAREST WRONG NEIGHBOUR — an expression that
    // handles every ASCII whitespace character and no other — which only NBSP or
    // LINE SEPARATOR can witness. Without it, deleting those two members (or having an editor
    // eat them) would leave every assertion here green.
    check(
        `the alphabet also exposes an ASCII-only class (precondition, ${exposesAsciiOnly.length} witness(es))`,
        exposesAsciiOnly.length > 0,
        'no input distinguishes an ASCII-only whitespace class, so the non-ASCII members of the alphabet are doing no work'
    );
    check(
        `the generator's FLATTENED matches \\s*\\n\\s* on all ${strings.length} inputs`,
        disagreements.length === 0,
        disagreements.length > 0
            ? `e.g. ${JSON.stringify(disagreements[0])}: ${JSON.stringify(usingDeclared(disagreements[0]))} vs ${JSON.stringify(usingOriginal(disagreements[0]))}`
            : ''
    );
    check(
        'a CRLF line ending flattens to one space',
        usingDeclared('a\r\nb') === 'a b',
        `got ${JSON.stringify(usingDeclared('a\r\nb'))}`
    );
}

// --- Case 2: --check is byte-exact and idempotent ----------------------------
{
    const root = freshRoot();
    const before = readFileSync(join(root, 'API.md'), 'utf8');
    const checked = runIn(root, ['--check']);
    check('--check passes on the committed API.md', checked.status === 0, checked.stderr.trim());
    const written = runIn(root, []);
    check('regeneration succeeds', written.status === 0, written.stderr.trim());
    check(
        'regeneration is byte-identical to the committed file',
        readFileSync(join(root, 'API.md'), 'utf8') === before
    );
    check(
        'the reported line count is the one wc -l would give',
        written.stdout.includes(`— ${before.split('\n').length - 1} lines`),
        `stdout was ${JSON.stringify(written.stdout.trim())}`
    );
}

// --- Case 3: --check can say no (the control) --------------------------------
{
    const root = freshRoot();
    const text = readFileSync(join(root, 'API.md'), 'utf8');
    writeFileSync(join(root, 'API.md'), `X${text.slice(1)}`);
    const result = runIn(root, ['--check']);
    check('--check refuses a hand-edited API.md', result.status === 1, `status ${result.status}`);
}

// --- Case 4: --check never writes -------------------------------------------
{
    const root = freshRoot();
    const edited = `X${readFileSync(join(root, 'API.md'), 'utf8').slice(1)}`;
    writeFileSync(join(root, 'API.md'), edited);
    runIn(root, ['--check']);
    check(
        '--check leaves the file alone rather than laundering the difference',
        readFileSync(join(root, 'API.md'), 'utf8') === edited
    );
}

// --- Case 4b: --check on a missing API.md says what to run ------------------
{
    const root = freshRoot();
    rmSync(join(root, 'API.md'));
    const result = runIn(root, ['--check']);
    const said = `${result.stdout}${result.stderr}`;
    check(
        '--check on a missing API.md exits 1 and names the command that writes it',
        result.status === 1 && said.includes('npm run docs:api'),
        `status ${result.status}, said ${JSON.stringify(said.trim().slice(0, 90))}`
    );
}

// --- Case 5: the preconditions refuse, rather than crashing or passing -------
for (const [label, mutate, expectedStatus, expectedText] of [
    ['a snapshot with no tools array', c => { delete c.tools; }, 2, 'no tools array'],
    ['tools: []', c => { c.tools = []; }, 2, 'lists no tools'],
    ['a snapshot with no resourceTemplates key', c => { delete c.resourceTemplates; }, 2, 'no resourceTemplates array'],
    ['resourceTemplates set to an object', c => { c.resourceTemplates = {}; }, 2, 'no resourceTemplates array'],
    ['resources: []', c => { c.resources = []; }, 2, 'lists no resources'],
    ['prompts: []', c => { c.prompts = []; }, 2, 'lists no prompts'],
    ['a snapshot missing capturedAt', c => { delete c.capturedAt; }, 2, 'protocolVersion, source or capturedAt'],
    ['a snapshot that is not JSON', () => 'not json', 2, 'cannot read']
]) {
    const root = freshRoot();
    const current = JSON.parse(readFileSync(join(root, 'catalogue.json'), 'utf8'));
    const replacement = mutate(current);
    writeFileSync(
        join(root, 'catalogue.json'),
        typeof replacement === 'string' ? replacement : JSON.stringify(current, null, 2)
    );
    const result = runIn(root, ['--check']);
    const said = `${result.stdout}${result.stderr}`;
    check(
        `${label} is refused with a named reason`,
        result.status === expectedStatus && said.includes(expectedText),
        `status ${result.status}, said ${JSON.stringify(said.trim().slice(0, 120))}`
    );
}

// --- Case 6: a nested default is rendered, not dropped -----------------------
{
    const root = freshRoot();
    const current = JSON.parse(readFileSync(join(root, 'catalogue.json'), 'utf8'));
    let planted = null;
    for (const tool of current.tools) {
        const properties = tool.inputSchema?.properties ?? {};
        for (const [name, property] of Object.entries(properties)) {
            if (planted || !property.properties) continue;
            const key = Object.keys(property.properties)[0];
            if (!key) continue;
            // 424, not a 4-5 digit number: the assertion below matches the digits as
            // they appear in the document, so a separator is impossible here and a
            // sentinel outside the leak sweep's declared window is the way out.
            property.properties[key].default = 424;
            planted = { tool: tool.name, name, key };
        }
    }
    check(
        'the snapshot still has a nested object parameter to plant a default on (precondition)',
        planted !== null,
        'no parameter carries `properties`, so this case would test nothing'
    );
    if (planted) {
        writeFileSync(join(root, 'catalogue.json'), JSON.stringify(current, null, 2));
        const written = runIn(root, []);
        const rendered = readFileSync(join(root, 'API.md'), 'utf8');
        check(
            `a nested default on ${planted.name}.${planted.key} reaches the document`,
            written.status === 0 && rendered.includes('default `424`'),
            `status ${written.status}`
        );
    }
}

// --- Case 6b: a malformed `required` does not become a stack trace ----------
{
    const root = freshRoot();
    const current = JSON.parse(readFileSync(join(root, 'catalogue.json'), 'utf8'));
    const tool = current.tools.find(entry => entry.inputSchema?.properties);
    check(
        'a tool with parameters exists to malform (precondition)',
        Boolean(tool),
        'no tool declares properties, so this case would test nothing'
    );
    if (tool) {
        tool.inputSchema.required = false;
        writeFileSync(join(root, 'catalogue.json'), JSON.stringify(current, null, 2));
        const written = runIn(root, []);
        check(
            'a non-array `required` renders rather than throwing',
            written.status === 0,
            `status ${written.status}, said ${JSON.stringify(`${written.stdout}${written.stderr}`.trim().slice(0, 110))}`
        );
    }
}

// --- Case 7: a union type and an items type survive the table ---------------
{
    const root = freshRoot();
    const current = JSON.parse(readFileSync(join(root, 'catalogue.json'), 'utf8'));
    const tool = current.tools[0];
    tool.inputSchema = tool.inputSchema ?? { type: 'object', properties: {} };
    tool.inputSchema.properties = tool.inputSchema.properties ?? {};
    tool.inputSchema.properties.__union = { type: ['string', 'null'], description: 'planted' };
    tool.inputSchema.properties.__list = { type: 'array', items: { type: 'number' }, description: 'planted' };
    tool.inputSchema.properties.__nested = {
        type: 'object',
        description: 'planted',
        properties: { __inner: { type: ['string', 'null'] } }
    };
    writeFileSync(join(root, 'catalogue.json'), JSON.stringify(current, null, 2));
    const written = runIn(root, []);
    const rendered = readFileSync(join(root, 'API.md'), 'utf8');
    check(
        'a union type is written with an escaped pipe, so the table survives it',
        written.status === 0 && rendered.includes('string \\| null'),
        `status ${written.status}`
    );
    check('an array of a scalar renders its item type', rendered.includes('array of number'));
    // The other half of "right in both places": a bullet is not a table, so the pipe
    // must arrive RAW there. Asserted rather than argued, because the comment in the
    // generator makes the claim about both sites.
    const nestedUnion = /^ {2}- `__inner` \(string \| null\)/mu.test(rendered);
    check('a union type in a nested-key bullet carries a RAW pipe, not an escaped one', nestedUnion);
}

for (const root of roots) rmSync(root, { recursive: true, force: true });

console.log('');
if (failures.length > 0) {
    console.error(`gen-api-doc self-test: FAIL — ${failures.length} of ${passed + failures.length} case(s)`);
    for (const failure of failures) console.error(`  - ${failure}`);
    process.exit(1);
}
console.log(`gen-api-doc self-test: PASS - ${passed} cases`);

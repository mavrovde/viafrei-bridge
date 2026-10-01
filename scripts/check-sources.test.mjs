#!/usr/bin/env node
/**
 * The sources-consistency check's self-test (#32).
 *
 * The check is forty lines of comparison, so the thing worth proving is not the
 * comparison — it is that each arm CAN say no, and that it says no for the right
 * reason with the right exit code. The three defects this check exists for are
 * planted here as mutants, because the check's whole claim is that it would have
 * caught them:
 *
 *   - a stated count that disagrees with the snapshot;
 *   - a fuel tool the snapshot carries and the page does not name, which is the
 *     licence half rather than the tidy half;
 *   - a derived call count that disagrees with read-only minus the excluded fuel
 *     tools, which is the figure the first fix got wrong in the one direction that
 *     matters.
 *
 * Exit 2 is reserved for "could not check" and is asserted separately, because a
 * check that cannot read its input must never resemble one that read it and was
 * satisfied.
 *
 *   node scripts/check-sources.test.mjs
 */

import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { nodePath, runTool } from './tools.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
const CHECK = join(HERE, 'check-sources.mjs');

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
    console.error(`check-sources self-test: CANNOT RUN - ${message}`);
    process.exit(2);
}

/** Run the check against a throwaway root. */
function run(root) {
    try {
        const out = runTool(nodePath(), [CHECK], {
            encoding: 'utf8',
            env: { ...process.env, SOURCES_LINT_ROOT: root }
        });
        return { status: 0, out };
    } catch (error) {
        return { status: error.status ?? -1, out: `${error.stdout ?? ''}${error.stderr ?? ''}` };
    }
}

const roots = [];

/**
 * A throwaway copy of the two real files, with `mutate` free to change either.
 * Derived from the REAL pair rather than from a hand-written fixture, so a case
 * cannot pass against a document that no longer resembles the one that ships.
 */
function fixture(mutate) {
    const root = mkdtempSync(join(tmpdir(), 'viafrei-sources-'));
    roots.push(root);
    const state = {
        page: readFileSync(join(ROOT, 'SOURCES.md'), 'utf8'),
        catalogue: JSON.parse(readFileSync(join(ROOT, 'catalogue.json'), 'utf8')),
        writePage: true,
        writeCatalogue: true
    };
    mutate(state);
    if (state.writePage) writeFileSync(join(root, 'SOURCES.md'), state.page);
    if (state.writeCatalogue) {
        writeFileSync(join(root, 'catalogue.json'), JSON.stringify(state.catalogue, null, 2));
    }
    return root;
}

// --- Precondition: the real pair is the state this check is meant to accept ----------
//
// If the repository were itself inconsistent, every red case below would pass for the
// wrong reason and the green one would be the only real signal.
{
    const result = run(ROOT);
    if (result.status !== 0) {
        refuse(`this repository's own SOURCES.md and catalogue.json disagree:\n${result.out}`);
    }
}

// --- The green case, and it must prove it READ something ----------------------------
{
    const result = run(ROOT);
    check(
        'the real pair passes, and the run says how much it compared',
        result.status === 0
        && /PASS - SOURCES\.md agrees/u.test(result.out)
        && /3 stated count\(s\) compared, 2 fuel tool\(s\) checked/u.test(result.out),
        `status ${result.status}, out ${JSON.stringify(result.out.slice(0, 160))}`
    );
}

// --- Red: the three defects this check exists for ------------------------------------

// 1. A stated count that drifted. This is the original #32 defect: the page said
//    sixteen read-only tools after the server had grown to seventeen.
{
    const result = run(fixture(state => {
        state.page = state.page.replace('seventeen of them read-only', 'sixteen of them read-only');
    }));
    check(
        'a stale read-only count is caught, naming both numbers',
        result.status === 1 && /read-only tools:.*"sixteen" \(16\).*gives 17/su.test(result.out),
        `status ${result.status}, out ${JSON.stringify(result.out.slice(0, 200))}`
    );
}

// 2. A fuel tool the page does not name. The LICENCE half: the exclusion exists
//    because MTS-K makes needless querying a risk to the access itself, so a tool
//    missing from the page is a reader calling something the page meant to protect.
{
    const result = run(fixture(state => {
        state.page = state.page.split('`find_fuel_station`').join('`find_SOMETHING_else`');
    }));
    check(
        'a fuel tool the page never names is caught as a licence problem',
        result.status === 1
        && /excluded fuel tools: find_fuel_station/u.test(result.out)
        && /licence condition/u.test(result.out),
        `status ${result.status}, out ${JSON.stringify(result.out.slice(0, 240))}`
    );
}

// 3. The derived call count. The first fix of #32 said "seventeen live calls" when the
//    page's own rule makes it fifteen — wrong toward "we would have to query the fuel
//    endpoint", which is what the licence condition prevents. This is the arm that
//    computes rather than reads.
{
    const result = run(fixture(state => {
        state.page = state.page.replace('would still mean **fifteen** live calls', 'would still mean **seventeen** live calls');
    }));
    check(
        'a wrong derived call count is caught, computed rather than read',
        result.status === 1 && /live calls a re-run would cost:.*"seventeen" \(17\).*gives 15/su.test(result.out),
        `status ${result.status}, out ${JSON.stringify(result.out.slice(0, 200))}`
    );
}

// 4. The count follows the SNAPSHOT, not the prose. Adding a read-only tool must make
//    the page's correct-today numbers wrong, which is what makes this a gate on growth
//    rather than a spell-checker.
{
    const result = run(fixture(state => {
        state.catalogue.tools.push({
            name: 'check_something_new',
            description: 'a tool the snapshot gained',
            inputSchema: { type: 'object', properties: {}, required: [] },
            annotations: { readOnlyHint: true },
            execution: { taskSupport: 'forbidden' }
        });
    }));
    check(
        'a tool added to the snapshot makes the page stale, on all three counts',
        result.status === 1
        && /total tools/u.test(result.out)
        && /read-only tools/u.test(result.out)
        && /live calls a re-run would cost/u.test(result.out),
        `status ${result.status}, out ${JSON.stringify(result.out.slice(0, 260))}`
    );
}

// 5. A new FUEL tool must fail twice over: the counts move AND it is unnamed.
{
    const result = run(fixture(state => {
        state.catalogue.tools.push({
            name: 'find_fuel_price_history',
            description: 'a second-generation fuel tool',
            inputSchema: { type: 'object', properties: {}, required: [] },
            annotations: { readOnlyHint: true },
            execution: { taskSupport: 'forbidden' }
        });
    }));
    check(
        'a NEW fuel tool is caught as unnamed, and the callable count stays put',
        result.status === 1
        && /excluded fuel tools: find_fuel_price_history/u.test(result.out)
        && /18 read-only, 3 fuel-constrained/u.test(result.out)
        && /15 callable/u.test(result.out),
        `status ${result.status}, out ${JSON.stringify(result.out.slice(0, 300))}`
    );
}

// --- Refusals: exit 2, never confusable with agreement -------------------------------
for (const [label, mutate, needle] of [
    ['a missing SOURCES.md', state => { state.writePage = false; }, 'cannot read the sources page'],
    ['a missing catalogue.json', state => { state.writeCatalogue = false; }, 'cannot read the catalogue snapshot'],
    ['a catalogue with no tools', state => { state.catalogue.tools = []; }, 'carries no tools'],
    [
        'a catalogue where nothing is read-only',
        state => {
            for (const tool of state.catalogue.tools) {
                if (tool.annotations) tool.annotations.readOnlyHint = false;
            }
        },
        'no tool in catalogue.json is marked readOnlyHint'
    ],
    [
        'a page re-worded past the patterns',
        state => { state.page = state.page.replace('of them read-only', 'of them are read only'); },
        'could not find'
    ]
]) {
    const result = run(fixture(mutate));
    check(
        `${label} is refused with exit 2, naming why`,
        result.status === 2 && result.out.includes(needle),
        `status ${result.status}, out ${JSON.stringify(result.out.slice(0, 200))}`
    );
}

// --- The floor: the fuel RULE must be unable to go quietly inert ----------------------
//
// The excluded set is a licence condition, so a naming rule that stops selecting the
// tools it is meant to select must REFUSE rather than report agreement about an empty
// set. Only a change to the RULE can provoke that, so this mutates a COPY of the check
// itself — a rename in the snapshot cannot, because the floor is keyed to tools that
// are present under a known name. The first draft of this case renamed a tool in the
// fixture and passed for the wrong reason, which is how that was discovered.
{
    const root = mkdtempSync(join(tmpdir(), 'viafrei-sources-rule-'));
    roots.push(root);
    writeFileSync(join(root, 'SOURCES.md'), readFileSync(join(ROOT, 'SOURCES.md'), 'utf8'));
    writeFileSync(join(root, 'catalogue.json'), readFileSync(join(ROOT, 'catalogue.json'), 'utf8'));
    const mutated = join(root, 'check-sources-inert-rule.mjs');
    const source = readFileSync(CHECK, 'utf8');
    // BOTH arms, or the surviving one still selects the tools and the floor never fires.
    // The first draft of this case neutered only the name rule and passed for the wrong
    // reason once the description arm existed.
    const RULES = [
        ['const FUEL_NAME = /fuel/u;', 'const FUEL_NAME = /petroleum/u;'],
        ['const FUEL_SOURCE = /Tankerk|MTS-K/iu;', 'const FUEL_SOURCE = /NOTHING_MATCHES_THIS/iu;']
    ];
    let inert = source;
    for (const [from, to] of RULES) {
        if (!inert.includes(from)) {
            refuse(`the fuel rule ${JSON.stringify(from)} is not the shape this case mutates, so the floor is untested`);
        }
        inert = inert.replace(from, to);
    }
    writeFileSync(mutated, inert);
    let status = 0;
    let out = '';
    try {
        out = runTool(nodePath(), [mutated], {
            encoding: 'utf8',
            env: { ...process.env, SOURCES_LINT_ROOT: root }
        });
    } catch (error) {
        status = error.status ?? -1;
        out = `${error.stdout ?? ''}${error.stderr ?? ''}`;
    }
    check(
        'a fuel rule gone inert REFUSES rather than reporting an empty excluded set',
        status === 2 && /rule did not match find_cheapest_fuel, find_fuel_station/u.test(out),
        `status ${status}, out ${JSON.stringify(out.slice(0, 220))}`
    );
}

// --- A RENAME no longer hides a fuel tool: the description arm catches it ------------
//
// This case used to pin a weakness. Relying on the name alone meant a fuel tool renamed
// away from the word `fuel` slipped the rule AND the floor — the floor is keyed to names
// it already knows — and was caught only by the arithmetic, with a message about a call
// count rather than about an unprotected tool. The description closes it: the renamed
// tool still names its provider in prose, so the LICENCE arm fires and says which tool
// is unprotected.
{
    const result = run(fixture(state => {
        for (const tool of state.catalogue.tools) {
            if (tool.name === 'find_cheapest_fuel') tool.name = 'find_cheapest_petrol';
        }
    }));
    check(
        'a fuel tool renamed past the NAME is still caught, by the description arm',
        result.status === 1
        && /excluded fuel tools: find_cheapest_petrol/u.test(result.out)
        && /licence condition/u.test(result.out)
        && /2 fuel-constrained/u.test(result.out),
        `status ${result.status}, out ${JSON.stringify(result.out.slice(0, 260))}`
    );
}

// --- And the limit that remains, asserted rather than assumed -------------------------
//
// Both arms are text matching, so a tool renamed away from `fuel` WHOSE DESCRIPTION also
// stops naming the provider matches neither, and is not on the floor either. It still
// goes RED — the callable count moves — but through the arithmetic and with a message
// about a call count. That is the honest reach of two text rules, and it is pinned here
// so a reader does not assume the pair is exhaustive.
{
    const result = run(fixture(state => {
        for (const tool of state.catalogue.tools) {
            if (tool.name === 'find_cheapest_fuel') {
                tool.name = 'find_cheapest_petrol';
                tool.description = 'prices near a place, from a source this sentence does not name';
            }
        }
    }));
    check(
        'a rename AND a scrubbed description falls back to the arithmetic, and is pinned',
        result.status === 1
        && /live calls a re-run would cost/u.test(result.out)
        && /1 fuel-constrained/u.test(result.out)
        && !/excluded fuel tools/u.test(result.out),
        `status ${result.status}, out ${JSON.stringify(result.out.slice(0, 260))}`
    );
}

// --- Invalid JSON is a refusal, not a crash ------------------------------------------
{
    const root = mkdtempSync(join(tmpdir(), 'viafrei-sources-'));
    roots.push(root);
    writeFileSync(join(root, 'SOURCES.md'), 'nothing here');
    writeFileSync(join(root, 'catalogue.json'), '{ not json');
    const result = run(root);
    check(
        'a catalogue that is not JSON is refused with exit 2',
        result.status === 2 && /not valid JSON/u.test(result.out),
        `status ${result.status}, out ${JSON.stringify(result.out.slice(0, 160))}`
    );
}

// --- The default root, with no override at all ---------------------------------------
//
// Every other case sets SOURCES_LINT_ROOT, so without this the default path is never
// exercised and a wrong default would be invisible. The repository's convention for a
// named private root override is that a self-test pins BOTH directions.
{
    const clean = { ...process.env };
    delete clean.SOURCES_LINT_ROOT;
    let status = 0;
    let out = '';
    try {
        out = runTool(nodePath(), [CHECK], { encoding: 'utf8', cwd: ROOT, env: clean });
    } catch (error) {
        status = error.status ?? -1;
        out = `${error.stdout ?? ''}${error.stderr ?? ''}`;
    }
    check(
        'with no SOURCES_LINT_ROOT it reads this repository and passes',
        status === 0 && /PASS - SOURCES\.md agrees/u.test(out),
        `status ${status}, out ${JSON.stringify(out.slice(0, 160))}`
    );
}

for (const root of roots) rmSync(root, { recursive: true, force: true });

console.log('');
if (failures.length > 0) {
    console.error(`check-sources self-test: FAIL - ${failures.length} of ${passed + failures.length} case(s)`);
    for (const failure of failures) console.error(`  - ${failure}`);
    process.exit(1);
}
console.log(`check-sources self-test: PASS - ${passed} cases`);

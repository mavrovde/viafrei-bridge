#!/usr/bin/env node
/**
 * `SOURCES.md` states counts ABOUT THE SERVER. This checks them against
 * `catalogue.json`, which ships in the same tarball and holds the answers.
 *
 * WHY THIS EXISTS (#32). The page told the reader how its status column was measured:
 * by calling "fifteen of the server's SIXTEEN read-only tools — every one except
 * `find_cheapest_fuel`". By the time anyone noticed, the server exposed nineteen tools,
 * seventeen of them read-only, and a SECOND fuel tool, `find_fuel_station`, that the
 * page did not name.
 *
 * The stale count was untidy. The unnamed tool was a LICENCE CONDITION: MTS-K sets a
 * minimum interval per station and its terms make needless querying a real risk to the
 * access itself, so the exclusion is not a convenience. A reader following the page's
 * own stated method would have called a fuel tool the page meant to protect.
 *
 * And the first fix carried its own false number — "seventeen live calls", when the
 * page's own rule (every read-only tool except the fuel ones) makes it fifteen. That
 * figure was wrong in the one direction that matters here: toward "we would have to
 * query the fuel endpoint". Which is why the derived count below is COMPUTED and never
 * read: it is the one number on that page a reader might act on.
 *
 * NO NETWORK. Both files ship together and every number is already in the snapshot, so
 * this is a consistency check between two committed artefacts — the same family as
 * `check-docs`, which proves `API.md` matches the snapshot. It belongs on every push.
 *
 * What it deliberately does NOT check: the status column (`live` / `in the service` /
 * `not re-measured`). That needs live calls and a judgement about what an answer means,
 * and automating it would spend provider calls to re-confirm what a person decided.
 * It stays dated and the page says so. The reference's currency against the running
 * server is a separate, network-bound artefact (#33).
 *
 *   node scripts/check-sources.mjs
 *
 * Exit 0 = the page agrees with the snapshot. 1 = it disagrees. 2 = could not check,
 * which is a failure and never a pass.
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = process.env.SOURCES_LINT_ROOT ?? join(dirname(fileURLToPath(import.meta.url)), '..');

/** Spelled-out numbers the page uses. It writes counts as words, not digits. */
const WORDS = Object.freeze({
    ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15,
    sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20,
    'twenty-one': 21, 'twenty-two': 22, 'twenty-three': 23, 'twenty-four': 24,
    'twenty-five': 25, 'twenty-six': 26, 'twenty-seven': 27, 'twenty-eight': 28,
    'twenty-nine': 29, thirty: 30
});
const WORD_ALTERNATION = Object.keys(WORDS).sort((a, b) => b.length - a.length).join('|');

/**
 * A tool is fuel-constrained if its name says so. The page's exclusion rule is about
 * the MTS-K source, and every tool that reaches it carries `fuel` in its name; the
 * alternative — reading `_meta.sources` — is exactly the live call this check avoids.
 * If that ever stops being true, the floor assertion below goes red rather than this
 * passing quietly.
 *
 * A NAME IS NOT THE ONLY TELL, and relying on it alone left a gap: a fuel tool RENAMED
 * away from the word `fuel` slipped both the rule and the floor, and was then caught only
 * by the arithmetic — with a message about a call count rather than about an unprotected
 * tool. The DESCRIPTION closes that, offline and from this same file: measured on this
 * snapshot, both fuel tools name their provider in prose and no other tool does. So a
 * tool is fuel-constrained if its NAME says so OR its DESCRIPTION names MTS-K or
 * Tankerkönig, and a rename alone no longer hides one.
 *
 * WHAT IS STILL NOT CLOSED, because both arms are text matching: a tool renamed away from
 * `fuel` WHOSE DESCRIPTION ALSO STOPS NAMING THE PROVIDER matches neither arm, and is not
 * on the floor either, since the floor is keyed to names it already knows. That one still
 * fails through the arithmetic. It is pinned in the self-test, so the remaining limit is
 * measured rather than assumed — and the floor is what stops either arm going quietly
 * inert.
 */
const FUEL_NAME = /fuel/u;

/**
 * The provider, as the fuel tools' own descriptions name it. The second tell, and the
 * one that survives a rename. Both spellings appear in the real descriptions.
 */
const FUEL_SOURCE = /Tankerk|MTS-K/iu;

/** Fuel tools known to exist. A floor, so a rule that stops matching cannot pass. */
const FUEL_FLOOR = ['find_cheapest_fuel', 'find_fuel_station'];

const findings = [];
const fail = (what, detail) => findings.push(`${what}: ${detail}`);

function refuse(message) {
    console.error(`check-sources: CANNOT CHECK - ${message}`);
    console.error('check-sources: this is a failure, not a pass: a check that read nothing has not checked');
    process.exit(2);
}

function read(path, label) {
    try {
        return readFileSync(join(ROOT, path), 'utf8');
    } catch (error) {
        return refuse(`cannot read ${label} at ${path} — ${error.message}`);
    }
}

const page = read('SOURCES.md', 'the sources page');
let catalogue;
try {
    catalogue = JSON.parse(read('catalogue.json', 'the catalogue snapshot'));
} catch (error) {
    refuse(`catalogue.json is not valid JSON — ${error.message}`);
}

// --- what the snapshot says, which is the truth this check compares against ---------
const tools = Array.isArray(catalogue.tools) ? catalogue.tools : undefined;
if (tools === undefined || tools.length === 0) {
    refuse('catalogue.json carries no tools, so there is nothing to compare the page with');
}
const readOnly = tools.filter(tool => tool.annotations?.readOnlyHint === true);
if (readOnly.length === 0) {
    refuse('no tool in catalogue.json is marked readOnlyHint, so the read-only count cannot be checked');
}
const isFuel = tool => FUEL_NAME.test(tool.name) || FUEL_SOURCE.test(tool.description ?? '');
const fuel = readOnly.filter(isFuel);

// The floor. If the naming rule stops matching the tools it is meant to match, this
// check must go RED rather than report agreement about an empty set — the silent-skip
// shape, and the one that would matter most here because the excluded set is a licence
// condition.
const known = FUEL_FLOOR.filter(name => tools.some(tool => tool.name === name));
const missedByRule = known.filter(name => !fuel.some(tool => tool.name === name));
if (missedByRule.length > 0) {
    refuse(
        `the fuel-tool rule did not match ${missedByRule.join(', ')}, which catalogue.json carries — ` +
        'the rule has drifted from the tools it is meant to select, and a wrong excluded set is a licence problem, not a formatting one'
    );
}

const expected = {
    tools: tools.length,
    readOnly: readOnly.length,
    callable: readOnly.length - fuel.length
};

// --- the claims, located by their own sentences rather than by line number ----------
//
// Each pattern is asserted to match before anything is compared. A pattern that stops
// matching after a re-word must not read as "nothing to check".
const CLAIMS = [
    {
        label: 'total tools',
        pattern: new RegExp(`it exposes (${WORD_ALTERNATION}) tools`, 'u'),
        actual: () => expected.tools,
        hint: 'the sentence naming how many tools the server exposes'
    },
    {
        label: 'read-only tools',
        pattern: new RegExp(`(${WORD_ALTERNATION}) of them read-only`, 'u'),
        actual: () => expected.readOnly,
        hint: 'the sentence naming how many of those are read-only'
    },
    {
        label: 'live calls a re-run would cost',
        pattern: new RegExp(`would still mean \\*\\*(${WORD_ALTERNATION})\\*\\* live calls`, 'u'),
        actual: () => expected.callable,
        hint: 'the sentence costing a re-run, which must equal read-only minus the excluded fuel tools'
    }
];

for (const claim of CLAIMS) {
    const match = claim.pattern.exec(page);
    if (match === null) {
        refuse(
            `could not find ${claim.hint} in SOURCES.md — the page may have been re-worded. ` +
            'Update this check rather than letting it pass over a claim it can no longer read'
        );
    }
    const stated = WORDS[match[1]];
    if (stated !== claim.actual()) {
        fail(
            claim.label,
            `SOURCES.md says "${match[1]}" (${stated}) but catalogue.json gives ${claim.actual()}`
        );
    }
}

// --- every fuel tool must be NAMED as excluded. The licence half. ------------------
for (const tool of fuel) {
    if (!page.includes(`\`${tool.name}\``)) {
        fail(
            'excluded fuel tools',
            `${tool.name} reaches the rate-limited fuel source and SOURCES.md never names it. ` +
            'The exclusion is an MTS-K licence condition, so a reader following the page\'s own method ' +
            'would call a tool the page means to protect'
        );
    }
}

const printable = `${expected.tools} tool(s), ${expected.readOnly} read-only, ` +
    `${fuel.length} fuel-constrained (${fuel.map(tool => tool.name).join(', ')}), ` +
    `${expected.callable} callable under the page's own rule`;

if (findings.length > 0) {
    console.error(`check-sources: FAIL - ${findings.length} finding(s)`);
    for (const finding of findings) console.error(`  ! ${finding}`);
    console.error(`  catalogue.json: ${printable}`);
    process.exit(1);
}

console.log(`check-sources: PASS - SOURCES.md agrees with catalogue.json`);
console.log(`  ${printable}`);
console.log(`  ${CLAIMS.length} stated count(s) compared, ${fuel.length} fuel tool(s) checked for being named`);

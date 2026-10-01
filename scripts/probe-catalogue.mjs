#!/usr/bin/env node
/**
 * Ask the RUNNING server what it is, and compare it with the shipped snapshot.
 *
 * WHY THIS EXISTS (#33). At the 1.4.6 cut, `API.md` and `catalogue.json` both shipped
 * saying server `1.3.22` with 18 tools, inside a package being published as 1.4.6 —
 * whose stated reason for that number is that the package and the endpoint can be named
 * by one. Re-capturing showed it was not merely dated: the server exposed a nineteenth
 * tool, `find_fuel_station`, that the reference never mentioned, and two tools carried
 * new descriptions. It was caught by a person, one round before the tag.
 *
 * `check-docs` cannot see this, and that is correct behaviour rather than a bug: it
 * proves `API.md` matches `catalogue.json`, so a stale PAIR passes together. Nor can
 * this become a CI step — this repository's test posture is that CI reaches nothing,
 * which is why every other check here is offline. So this is a CUT-TIME script, run by
 * a person, and it is the only thing in the repository that makes a network call.
 *
 * READ-ONLY, AND NO TOOL IS INVOKED. `initialize` plus the four list calls, nothing
 * else. That is not politeness: the fuel source sets a minimum interval per station and
 * its terms make needless querying a real risk to the access itself, so a probe that
 * called tools would be a licence problem rather than a slow script.
 *
 *   node scripts/probe-catalogue.mjs                 # compare, and report
 *   node scripts/probe-catalogue.mjs --write         # also rewrite the snapshot
 *
 * Exit 0 = the snapshot matches the server. 1 = it does not, and the report says whether
 * it is WRONG or merely DATED. 2 = could not probe, which is a failure and never a pass.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = process.env.PROBE_ROOT ?? join(dirname(fileURLToPath(import.meta.url)), '..');
const SNAPSHOT = join(ROOT, 'catalogue.json');

/** Each list call, and where its answer lives in both the response and the snapshot. */
const LISTS = Object.freeze([
    { method: 'tools/list', key: 'tools', identity: entry => entry.name },
    { method: 'resources/list', key: 'resources', identity: entry => entry.uri },
    { method: 'resources/templates/list', key: 'resourceTemplates', identity: entry => entry.uriTemplate },
    { method: 'prompts/list', key: 'prompts', identity: entry => entry.name }
]);

/** Patterns longer than this are stored as a length, not as text. The snapshot's rule. */
const PATTERN_TEXT_LIMIT = 60;

const PROTOCOL = '2025-06-18';
const TIMEOUT_MS = Number(process.env.PROBE_TIMEOUT_MS ?? 20_000);

function refuse(message) {
    console.error(`probe-catalogue: CANNOT PROBE - ${message}`);
    console.error('probe-catalogue: this is a failure, not a pass: a probe that read nothing has not checked');
    process.exit(2);
}

/** One JSON-RPC call. The server answers either JSON or a single SSE event. */
async function call(url, method, params, session) {
    const headers = {
        'content-type': 'application/json',
        accept: 'application/json, text/event-stream',
        ...(session === undefined ? {} : { 'mcp-session-id': session, 'mcp-protocol-version': PROTOCOL })
    };
    let response;
    try {
        response = await fetch(url, {
            method: 'POST',
            headers,
            body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
            signal: AbortSignal.timeout(TIMEOUT_MS)
        });
    } catch (error) {
        refuse(`${method} could not reach ${url} — ${error.message}`);
    }
    const body = await response.text();
    const messages = body.startsWith('event:')
        ? body.split('\n').filter(line => line.startsWith('data:')).map(line => JSON.parse(line.slice(5).trim()))
        : [JSON.parse(body)];
    const answer = messages.find(message => message.result !== undefined || message.error !== undefined);
    if (answer === undefined) {
        refuse(`${method} returned no result and no error — the response shape is not one this probe can read`);
    }
    if (answer.error !== undefined) {
        refuse(`${method} was refused by the server: ${JSON.stringify(answer.error)}`);
    }
    return { result: answer.result, session: response.headers.get('mcp-session-id') ?? session };
}

/**
 * The two substitutions the snapshot's own `$comment` documents, and nothing else.
 * Both are asserted by the caller: a `$schema` stored would put a host on this
 * repository's allow-list that nothing else needs, and a 288-character date pattern
 * kept as text hands the leak sweep's number rule a run of selected digit classes.
 */
let schemasDropped = 0;
let patternsReplaced = 0;

function normalise(value) {
    if (Array.isArray(value)) return value.map(normalise);
    if (value === null || typeof value !== 'object') return value;
    const out = {};
    for (const [key, inner] of Object.entries(value)) {
        if (key === '$schema') {
            schemasDropped += 1;
            continue;
        }
        if (key === 'pattern' && typeof inner === 'string' && inner.length > PATTERN_TEXT_LIMIT) {
            patternsReplaced += 1;
            out.patternLength = inner.length;
            continue;
        }
        out[key] = normalise(inner);
    }
    return out;
}

// --- the snapshot that ships -------------------------------------------------------
let stored;
try {
    stored = JSON.parse(readFileSync(SNAPSHOT, 'utf8'));
} catch (error) {
    refuse(`cannot read catalogue.json at ${SNAPSHOT} — ${error.message}`);
}
if (typeof stored.source !== 'string' || stored.source.length === 0) {
    refuse('catalogue.json names no source, so there is no endpoint to probe');
}
const url = stored.source;

// --- the server -------------------------------------------------------------------
const init = await call(url, 'initialize', {
    protocolVersion: PROTOCOL,
    capabilities: {},
    clientInfo: { name: 'viafrei-catalogue-probe', version: '0.0.0' }
});
const session = init.session;
if (typeof init.result?.serverInfo?.version !== 'string') {
    refuse('initialize returned no serverInfo.version — the answer is not one this probe can judge');
}

try {
    await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'mcp-session-id': session, 'mcp-protocol-version': PROTOCOL },
        body: JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }),
        signal: AbortSignal.timeout(TIMEOUT_MS)
    });
} catch {
    // The notification is a courtesy; the lists work without it.
}

const live = { serverInfo: init.result.serverInfo };
for (const list of LISTS) {
    const answer = await call(url, list.method, {}, session);
    const entries = answer.result?.[list.key];
    if (!Array.isArray(entries) || entries.length === 0) {
        refuse(
            `${list.method} returned no ${list.key} — an empty list must never compare equal to a stored one, ` +
            'because "the server told us nothing" and "the server matches" are different answers'
        );
    }
    live[list.key] = normalise(entries);
}

// Release the session rather than leaving it open on the server.
try {
    await fetch(url, {
        method: 'DELETE',
        headers: { 'mcp-session-id': session, 'mcp-protocol-version': PROTOCOL },
        signal: AbortSignal.timeout(TIMEOUT_MS)
    });
} catch {
    // The session will expire by itself; nothing here depends on the delete.
}

// Both substitutions must have FIRED, or the capture is not the shape it claims.
if (schemasDropped !== live.tools.length) {
    refuse(`dropped ${schemasDropped} $schema keys for ${live.tools.length} tools — every tool should carry one`);
}
if (patternsReplaced === 0) {
    refuse('no long pattern was stored as a length, but the snapshot documents that substitution — the rule may have drifted');
}

// --- compare ----------------------------------------------------------------------
const differences = [];
let surfaceMoved = false;

for (const list of LISTS) {
    const before = new Map((stored[list.key] ?? []).map(entry => [list.identity(entry), entry]));
    const after = new Map(live[list.key].map(entry => [list.identity(entry), entry]));

    for (const id of after.keys()) {
        if (!before.has(id)) {
            differences.push(`${list.key}: the server has ${id}, the snapshot does not`);
            surfaceMoved = true;
        }
    }
    for (const id of before.keys()) {
        if (!after.has(id)) {
            differences.push(`${list.key}: the snapshot has ${id}, the server does not`);
            surfaceMoved = true;
        }
    }
    for (const [id, entry] of after) {
        const previous = before.get(id);
        if (previous !== undefined && JSON.stringify(previous) !== JSON.stringify(entry)) {
            differences.push(`${list.key}: ${id} differs between the server and the snapshot`);
            surfaceMoved = true;
        }
    }
}

const versionMoved = stored.serverInfo?.version !== live.serverInfo.version;
if (versionMoved) {
    differences.push(`serverInfo.version: the snapshot says ${stored.serverInfo?.version}, the server says ${live.serverInfo.version}`);
}

const counts = LISTS.map(list => `${live[list.key].length} ${list.key}`).join(', ');
console.log(`probe-catalogue: ${url} reports ${live.serverInfo.version} — ${counts}`);
console.log(`  snapshot: ${stored.serverInfo?.version}, captured ${stored.capturedAt}`);

if (process.argv.includes('--write')) {
    const next = {
        ...stored,
        capturedAt: new Date().toISOString().slice(0, 10),
        protocolVersion: init.result.protocolVersion ?? stored.protocolVersion,
        serverInfo: live.serverInfo,
        capabilities: init.result.capabilities ?? stored.capabilities,
        instructions: init.result.instructions ?? stored.instructions,
        ...Object.fromEntries(LISTS.map(list => [list.key, live[list.key]]))
    };
    if (Object.keys(next).join(',') !== Object.keys(stored).join(',')) {
        refuse(`rewriting would change the snapshot's top-level shape, from ${Object.keys(stored)} to ${Object.keys(next)}`);
    }
    writeFileSync(SNAPSHOT, `${JSON.stringify(next, null, 2)}\n`);
    console.log('  --write: catalogue.json rewritten; run `npm run docs:api` to regenerate API.md');
}

if (differences.length === 0) {
    console.log('probe-catalogue: PASS - the snapshot matches the running server');
    process.exit(0);
}

// DATED versus WRONG. The distinction is the whole point of the report: at 1.4.6 the
// reference omitted a tool the server exposed, which is wrong and misleads a reader; at
// 1.4.8 only the version string had moved, which is old. They need different remedies,
// and naming the wrong one is how a reader is misled about what they are holding.
console.error('');
if (surfaceMoved) {
    console.error('probe-catalogue: FAIL - the snapshot is WRONG about this server, not merely dated.');
    console.error('  The surface itself differs, so the shipped reference describes tools, resources or');
    console.error('  prompts the server does not have, or omits ones it does. Re-capture before cutting.');
} else {
    console.error('probe-catalogue: FAIL - the snapshot is DATED. The surface is unchanged; only the');
    console.error('  version or the capture date has moved. Re-capturing is a version string, and saying');
    console.error('  so is honest; claiming the surface changed would not be.');
}
for (const difference of differences) console.error(`  ! ${difference}`);
console.error('');
console.error('  Re-capture with:  node scripts/probe-catalogue.mjs --write && npm run docs:api');
process.exit(1);

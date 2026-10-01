#!/usr/bin/env node
/**
 * The freshness probe's self-test — the only thing that proves its verdict can
 * go red, and that it says "could not check" where it cannot check.
 *
 * Hermetic: every case runs against a local `node:http` stub on loopback whose
 * URL is passed with `--endpoint`, so no case touches the public endpoint and no
 * case touches a provider. The stub is what lets a STALE payload exist at all —
 * prod is healthy, so the defect this script exists for cannot be observed
 * against prod by definition.
 *
 *   node scripts/probe-freshness.test.mjs
 */

import { createServer } from 'node:http';
import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CHECK = fileURLToPath(new URL('./probe-freshness.mjs', import.meta.url));

let passed = 0;
let failed = 0;

function check(label, ok, detail) {
    if (ok) {
        passed += 1;
        console.log(`  ok   ${label}`);
    } else {
        failed += 1;
        console.log(`  FAIL ${label}${detail === undefined ? '' : ` — ${detail}`}`);
    }
}

function refuse(message) {
    console.error(`freshness self-test: REFUSED - ${message}`);
    process.exit(2);
}

/** An answer shaped the way prod really answers, with a chosen age. */
function answer({ ageMinutes = 1, attribution = 'Verkehrsdaten: Autobahn GmbH des Bundes', asOf, omitAsOf = false, omitMeta = false, isError = false } = {}) {
    const meta = { attribution, sources: ['autobahn'] };
    if (!omitAsOf) {
        meta.asOf = asOf ?? new Date(Date.now() - ageMinutes * 60_000).toISOString();
    }
    const result = { content: [{ type: 'text', text: 'stub answer' }] };
    if (!omitMeta) result._meta = meta;
    if (isError) result.isError = true;
    return { jsonrpc: '2.0', id: 9, result };
}

/**
 * A stub speaking enough Streamable HTTP for this script: initialize with a
 * session header, then one reply per tools/call. `reply` is a function of the
 * tool name so a single case can make one feed stale and the rest fresh.
 */
function startStub({ reply, sessionId = 'stub-session-1', omitSession = false, serverVersion = '1.4.9', raw = null, rpcError = null, asSse = true }) {
    const server = createServer((request, response) => {
        if (request.method === 'DELETE') {
            response.writeHead(200).end();
            return;
        }
        let body = '';
        request.on('data', chunk => { body += chunk; });
        request.on('end', () => {
            let parsed = {};
            try {
                parsed = JSON.parse(body);
            } catch {
                parsed = {};
            }
            if (parsed.method === 'notifications/initialized') {
                response.writeHead(202).end();
                return;
            }
            const headers = { 'content-type': asSse ? 'text/event-stream' : 'application/json' };
            if (parsed.method === 'initialize') {
                if (!omitSession) headers['mcp-session-id'] = sessionId;
                const payload = {
                    jsonrpc: '2.0',
                    id: 1,
                    result: { protocolVersion: '2025-06-18', capabilities: {}, serverInfo: { name: 'viafrei', version: serverVersion } }
                };
                response.writeHead(200, headers);
                response.end(asSse ? `event: message\ndata: ${JSON.stringify(payload)}\n\n` : JSON.stringify(payload));
                return;
            }
            if (raw !== null) {
                response.writeHead(200, headers).end(raw);
                return;
            }
            if (rpcError !== null) {
                const payload = { jsonrpc: '2.0', id: 9, error: rpcError };
                response.writeHead(200, headers);
                response.end(asSse ? `event: message\ndata: ${JSON.stringify(payload)}\n\n` : JSON.stringify(payload));
                return;
            }
            const tool = parsed.params?.name ?? '';
            const payload = reply(tool);
            response.writeHead(200, headers);
            response.end(asSse ? `event: message\ndata: ${JSON.stringify(payload)}\n\n` : JSON.stringify(payload));
        });
    });
    return new Promise(resolve => {
        server.listen(0, '127.0.0.1', () => {
            const { port } = server.address();
            resolve({ server, url: `http://127.0.0.1:${port}/mcp` });
        });
    });
}

function run(scriptPath, args) {
    return new Promise(resolve => {
        execFile(process.execPath, [scriptPath, ...args], { timeout: 30_000 }, (error, stdout, stderr) => {
            resolve({
                status: error === null ? 0 : (typeof error.code === 'number' ? error.code : 1),
                out: `${stdout}${stderr}`
            });
        });
    });
}

function runSplit(scriptPath, args) {
    return new Promise(resolve => {
        execFile(process.execPath, [scriptPath, ...args], { timeout: 30_000 }, (error, stdout, stderr) => {
            resolve({
                status: error === null ? 0 : (typeof error.code === 'number' ? error.code : 1),
                stdout,
                stderr
            });
        });
    });
}

async function withStub(options, body) {
    const { server, url } = await startStub(options);
    try {
        return await body(url);
    } finally {
        await new Promise(done => server.close(done));
    }
}

console.log('freshness self-test: every case against a local stub on loopback');

// --- The instrument works: all fresh passes, and the run says what it read ----
await withStub({ reply: () => answer({ ageMinutes: 1 }) }, async url => {
    const result = await run(CHECK, ['--endpoint', url]);
    check('all feeds fresh: exit 0 and the count is printed',
        result.status === 0 && /PASS - 5 feed\(s\) asked/u.test(result.out),
        `status ${result.status}, out ${JSON.stringify(result.out.slice(0, 200))}`);
    check('the run prints each feed\'s measured age',
        /check_autobahn_traffic: 1 min old/u.test(result.out),
        JSON.stringify(result.out.slice(0, 300)));
});

// --- The defect it exists for: ONE feed stale, and it is named ----------------
await withStub({
    reply: tool => (tool === 'check_transit_disruption'
        ? answer({ ageMinutes: 400 })
        : answer({ ageMinutes: 1 }))
}, async url => {
    const result = await run(CHECK, ['--endpoint', url]);
    check('one stale feed: exit 1, named, with its age and limit',
        result.status === 1
        && /check_transit_disruption/u.test(result.out)
        && /400 min old, limit is 90 min/u.test(result.out)
        && /1 of 5 feed\(s\) are stale/u.test(result.out),
        `status ${result.status}, out ${JSON.stringify(result.out.slice(0, 400))}`);
    check('a stale run does NOT name a healthy feed as stale',
        !/STALE check_autobahn_traffic/u.test(result.out),
        JSON.stringify(result.out.slice(0, 400)));
});

// --- The slow feed's own limit is real, not the fast one's --------------------
await withStub({
    reply: tool => (tool === 'check_road_status'
        ? answer({ ageMinutes: 400 })   // inside 72 h, far outside 90 min
        : answer({ ageMinutes: 1 }))
}, async url => {
    const result = await run(CHECK, ['--endpoint', url]);
    check('the daily feed at 400 min PASSES on its own 72 h limit',
        result.status === 0,
        `status ${result.status}, out ${JSON.stringify(result.out.slice(0, 300))}`);
});
await withStub({
    reply: tool => (tool === 'check_road_status'
        ? answer({ ageMinutes: 60 * 80 })  // beyond 72 h
        : answer({ ageMinutes: 1 }))
}, async url => {
    const result = await run(CHECK, ['--endpoint', url]);
    check('the daily feed beyond 72 h still FAILS, so its limit is not infinite',
        result.status === 1 && /check_road_status/u.test(result.out),
        `status ${result.status}, out ${JSON.stringify(result.out.slice(0, 300))}`);
});

// --- A missing field is a DEFECT, never a pass --------------------------------
for (const [label, options, expect] of [
    ['no asOf', { omitAsOf: true }, /carried no asOf/u],
    ['no _meta', { omitMeta: true }, /carried no _meta/u],
    ['no attribution', { attribution: '' }, /carried no attribution, which is a licence condition/u],
    ['isError', { isError: true }, /answered with isError/u],
    ['unparseable asOf', { asOf: 'not-an-instant' }, /not a parseable instant/u],
    ['asOf in the future', { asOf: new Date(Date.now() + 90 * 60_000).toISOString() }, /in the FUTURE/u]
]) {
    // eslint-disable-next-line no-await-in-loop
    await withStub({ reply: () => answer(options) }, async url => {
        const result = await run(CHECK, ['--endpoint', url]);
        check(`${label}: exit 1 and said so`,
            result.status === 1 && expect.test(result.out),
            `status ${result.status}, out ${JSON.stringify(result.out.slice(0, 300))}`);
    });
}

// --- "Could not check" is exit 2, and never exit 0 ----------------------------
await withStub({ reply: () => answer(), raw: 'this is not json and not sse' }, async url => {
    const result = await run(CHECK, ['--endpoint', url]);
    check('an unreadable response REFUSES (exit 2), not "stale" and not "fine"',
        result.status === 2 && /did not parse/u.test(result.out),
        `status ${result.status}, out ${JSON.stringify(result.out.slice(0, 300))}`);
});
await withStub({ reply: () => answer(), omitSession: true }, async url => {
    const result = await run(CHECK, ['--endpoint', url]);
    check('no session header: exit 2 naming the session',
        result.status === 2 && /mcp-session-id/u.test(result.out),
        `status ${result.status}, out ${JSON.stringify(result.out.slice(0, 300))}`);
});
{
    const result = await run(CHECK, ['--endpoint', 'http://127.0.0.1:1/mcp']);
    check('an unreachable endpoint: exit 2, never 0',
        result.status === 2,
        `status ${result.status}, out ${JSON.stringify(result.out.slice(0, 200))}`);
}
{
    const result = await run(CHECK, ['--wat']);
    check('an unknown option: exit 2 before any request',
        result.status === 2 && /unknown option/u.test(result.out),
        `status ${result.status}, out ${JSON.stringify(result.out.slice(0, 200))}`);
}

// --- Plain JSON as well as SSE, so a transport change is not a false alarm ----
await withStub({ reply: () => answer({ ageMinutes: 1 }), asSse: false }, async url => {
    const result = await run(CHECK, ['--endpoint', url]);
    check('a plain-JSON transport is read as well as SSE',
        result.status === 0,
        `status ${result.status}, out ${JSON.stringify(result.out.slice(0, 300))}`);
});

// --- A JSON-RPC ERROR is "could not check", and the server's message survives --
//
// THE CASE WHOSE ABSENCE LET THE DEFECT SHIP. The server answers a protocol error
// when a tool is retired or an argument renamed — and this watch list hard-codes
// seven argument names, so it is reachable rather than theoretical. The first
// draft fell through to the no-result branch: exit 1, every feed printed STALE on
// a HEALTHY service, and `error.message` — the entire diagnosis — discarded.
await withStub({
    reply: () => answer(),
    rpcError: { code: -32602, message: 'Invalid arguments: unknown property "limit"' }
}, async url => {
    const result = await run(CHECK, ['--endpoint', url]);
    check('a JSON-RPC error REFUSES (exit 2), not exit 1',
        result.status === 2,
        `status ${result.status}, out ${JSON.stringify(result.out.slice(0, 300))}`);
    check('the server\'s own error message and code reach the output',
        /-32602/u.test(result.out) && /unknown property "limit"/u.test(result.out),
        JSON.stringify(result.out.slice(0, 400)));
    check('a protocol error is NOT labelled STALE, because that is a claim about the data',
        !/STALE/u.test(result.out) && /\?\?\?\?\?/u.test(result.out),
        JSON.stringify(result.out.slice(0, 400)));
    check('the refusal does not claim the body failed to parse, because it did not',
        !/did not parse/u.test(result.out) && /could not be read as a measurement/u.test(result.out),
        JSON.stringify(result.out.slice(0, 400)));
});

// --- --json puts JSON on stdout and NOTHING else -----------------------------
//
// The first draft printed the PASS summary to stdout after the document, so the
// stream did not parse. Asserted here because that is a contract a caller relies
// on and nothing else would notice it breaking.
await withStub({ reply: () => answer({ ageMinutes: 1 }) }, async url => {
    const result = await runSplit(CHECK, ['--endpoint', url, '--json']);
    let parsed = null;
    try {
        parsed = JSON.parse(result.stdout);
    } catch {
        parsed = null;
    }
    check('--json: stdout parses as JSON on its own',
        result.status === 0 && parsed !== null && Array.isArray(parsed.rows) && parsed.rows.length === 5,
        `status ${result.status}, stdout ${JSON.stringify(result.stdout.slice(0, 200))}`);
    check('--json: the human summary goes to stderr, not into the document',
        /PASS - 5 feed\(s\) asked/u.test(result.stderr) && !/PASS - 5 feed\(s\) asked/u.test(result.stdout),
        `stderr ${JSON.stringify(result.stderr.slice(0, 160))}`);
});

// --- The two preconditions, by MUTATING THE SCRIPT rather than the fixture ---
//
// These cannot be provoked through an endpoint: they are properties of the watch
// list itself. A copy of the real script is edited so the guard under test is the
// shipped one, and each mutation is asserted to have changed the file — an
// edit that silently matched nothing would make the case pass for no reason.
const scratch = mkdtempSync(join(tmpdir(), 'freshness-selftest-'));
const source = readFileSync(CHECK, 'utf8');

{
    const marker = "const FORBIDDEN = /fuel/iu;";
    if (!source.includes(marker)) refuse('the fuel guard is not the shape this case mutates, so it is untested');
    // Put a fuel tool in the list; the guard must refuse before any request.
    const mutated = source.replace(
        "        tool: 'check_autobahn_traffic',",
        "        tool: 'find_cheapest_fuel',"
    );
    if (mutated === source) refuse('the watch-list mutation changed nothing');
    const path = join(scratch, 'fuel-in-list.mjs');
    writeFileSync(path, mutated);
    const result = await run(path, ['--endpoint', 'http://127.0.0.1:1/mcp']);
    check('a fuel tool in the watch list REFUSES by name, before any request',
        result.status === 2 && /fuel tool/u.test(result.out) && /find_cheapest_fuel/u.test(result.out),
        `status ${result.status}, out ${JSON.stringify(result.out.slice(0, 300))}`);
}

{
    // An empty list must refuse rather than report success having asked nothing.
    const mutated = source.replace(/const WATCH = \[[\s\S]*?\n\];/u, 'const WATCH = [];');
    if (mutated === source) refuse('the empty-list mutation changed nothing');
    const path = join(scratch, 'empty-list.mjs');
    writeFileSync(path, mutated);
    const result = await run(path, ['--endpoint', 'http://127.0.0.1:1/mcp']);
    check('an empty watch list REFUSES instead of passing with nothing asked',
        result.status === 2 && /asked nothing/u.test(result.out),
        `status ${result.status}, out ${JSON.stringify(result.out.slice(0, 300))}`);
}

{
    // Fail-closed: a tool nobody listed in ALLOWED must be refused, even though
    // it is not a fuel tool and nothing else objects to it.
    const mutated = source.replace(
        "        tool: 'check_autobahn_traffic',",
        "        tool: 'describe_location',"
    );
    if (mutated === source) refuse('the unlisted-tool mutation changed nothing');
    const path = join(scratch, 'unlisted-tool.mjs');
    writeFileSync(path, mutated);
    const result = await run(path, ['--endpoint', 'http://127.0.0.1:1/mcp']);
    check('a tool absent from the allow-list REFUSES by name, before any request',
        result.status === 2 && /not on the allow-list/u.test(result.out) && /describe_location/u.test(result.out),
        `status ${result.status}, out ${JSON.stringify(result.out.slice(0, 300))}`);
}

{
    // The fuel arm is NOT redundant with the allow-list, and this is the proof:
    // somebody who adds a fuel tool to BOTH lists is still refused, and refused
    // with the LICENCE reason rather than a bookkeeping one.
    let mutated = source.replace(
        "        tool: 'check_autobahn_traffic',",
        "        tool: 'find_fuel_station',"
    );
    mutated = mutated.replace(
        "    'check_autobahn_traffic',",
        "    'find_fuel_station',"
    );
    if (mutated === source) refuse('the both-lists mutation changed nothing');
    if (!mutated.includes("    'find_fuel_station',")) refuse('the allow-list half of the both-lists mutation did not apply');
    const path = join(scratch, 'fuel-in-both.mjs');
    writeFileSync(path, mutated);
    const result = await run(path, ['--endpoint', 'http://127.0.0.1:1/mcp']);
    check('a fuel tool allow-listed TOO is still refused, on licence grounds',
        result.status === 2 && /LICENCE/u.test(result.out) && /find_fuel_station/u.test(result.out),
        `status ${result.status}, out ${JSON.stringify(result.out.slice(0, 300))}`);
}

console.log(`\nfreshness self-test: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
if (passed < 27) {
    refuse(`only ${passed} assertions ran; this suite is meant to carry at least 27`);
}
console.log(`freshness self-test: PASS - ${passed} cases, every one against a local stub on loopback`);

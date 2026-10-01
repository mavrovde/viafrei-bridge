#!/usr/bin/env node
/**
 * Is the service ALIVE, not merely answering?
 *
 * A server can return 200 with a correctly shaped body for days while an ingest
 * worker is dead. Every other check in this repository would stay green through
 * that: the stub tests prove the bridge's transport, `check:docs` proves the
 * document matches the snapshot, and the cut-time probe proves the SURFACE still
 * matches. None of them reads the age of the data in an answer.
 *
 * This asks the real server and judges `_meta.asOf`, which every real-time tool
 * carries. It is the only check here that can tell a live service from a
 * responding one.
 *
 *   node scripts/probe-freshness.mjs [--endpoint URL] [--json]
 *
 * Exit codes are three, because "could not check" and "checked and it is wrong"
 * are different answers:
 *
 *   0  every tool answered and every answer is within its own limit
 *   1  a real defect: an answer is STALE, or carries no `asOf`, or no attribution
 *   2  could not check: the endpoint, the session, or a response shape
 *
 * THE LIMITS ARE PER TOOL AND THAT IS NOT A DETAIL. Measured against prod on
 * 2026-10-01: autobahn, transit, weather and departures all answered within a
 * minute, while `check_road_status` was 7.5 h old because it blends the BASt
 * roadworks feed, which updates about daily. One global limit would be either
 * useless for the fast feeds or permanently red for the slow one, and a check
 * that is permanently red is a check that gets switched off.
 *
 * Each limit is therefore set to catch a DEAD worker, not a slow one: roughly an
 * order of magnitude above the source's own declared cadence, so normal variation
 * never fires it. The roadworks figure is the catalogue's (twice daily), not an
 * inference from the single reading this was written against.
 *
 * NO FUEL TOOL IS EVER CALLED. `find_cheapest_fuel` and `find_fuel_station`
 * answer from MTS-K / Tankerkönig, which sets a minimum interval per station and
 * limits use to answering a consumer's question. A monitoring query is not that,
 * so it is excluded on LICENCE grounds rather than cost, and the exclusion is
 * asserted below rather than left to whoever edits the list next.
 */

const DEFAULT_ENDPOINT = 'https://mcp.viafrei.de/mcp';

/**
 * The tools asked, their arguments, and the age at which each is a defect.
 *
 * `observed` records what prod actually answered when the limit was chosen, so a
 * future reader can see the headroom rather than guess at it.
 */
const WATCH = [
    {
        tool: 'check_autobahn_traffic',
        args: { roads: ['A1'], limit: 1 },
        limitMinutes: 90,
        observed: 'about 1 min on 2026-10-01'
    },
    {
        tool: 'check_transit_disruption',
        args: { region: 'Nordrhein-Westfalen', window_min: 60 },
        limitMinutes: 90,
        observed: 'about 1 min on 2026-10-01'
    },
    {
        tool: 'check_weather_warnings',
        args: { place: 'Köln' },
        limitMinutes: 90,
        observed: 'about 1 min on 2026-10-01'
    },
    {
        tool: 'get_train_departures',
        args: { station: 'Köln Hbf', limit: 1 },
        limitMinutes: 90,
        observed: 'about 1 min on 2026-10-01'
    },
    {
        // Blends the BASt roadworks feed, which the Mobilithek catalogue declares
        // as TWICE DAILY — a declared cadence rather than my one reading, so the
        // limit below is about six times the interval rather than "probably
        // enough". It must clear a weekend, or a Monday is a false alarm for ever.
        tool: 'check_road_status',
        args: { road: 'A3', limit: 1 },
        limitMinutes: 60 * 72,
        observed: '7.5 h on 2026-10-01'
    }
];

/**
 * The only tools this script may call, named one by one.
 *
 * An allow-list rather than a deny-rule, and the direction is the point: with a
 * deny-rule a NEW entry runs unless it matches, and here the failure mode is a
 * licence breach against a provider that can revoke access. Fail-closed is the
 * right default on that path, so an entry nobody listed here is refused.
 */
const ALLOWED = new Set([
    'check_autobahn_traffic',
    'check_transit_disruption',
    'check_weather_warnings',
    'get_train_departures',
    'check_road_status'
]);

/**
 * And never a fuel tool, stated separately because it says something the
 * allow-list does not: WHY. MTS-K / Tankerkönig sets a minimum interval per
 * station and limits use to answering a consumer's question.
 *
 * Not redundant with `ALLOWED` and the self-test proves it: this is what catches
 * somebody who adds a fuel tool to BOTH lists, which is the realistic way the
 * exclusion would be lost.
 */
const FORBIDDEN = /fuel/iu;

const REQUEST_TIMEOUT_MS = 30_000;

function fail(message) {
    console.error(`probe-freshness: FAIL - ${message}`);
    process.exit(1);
}

function refuse(message) {
    console.error(`probe-freshness: REFUSED - ${message}`);
    console.error('  This is "could not check", not "checked and it is fine".');
    process.exit(2);
}

/**
 * A Streamable-HTTP response is either JSON or an SSE stream carrying one
 * `data:` line per message. Both shapes are read here so a transport change in
 * either direction is a parse refusal rather than a silent empty result.
 */
function parseBody(text) {
    const trimmed = text.trim();
    if (trimmed === '') return null;
    if (trimmed.startsWith('{')) {
        try {
            return JSON.parse(trimmed);
        } catch {
            return null;
        }
    }
    for (const line of trimmed.split('\n')) {
        if (!line.startsWith('data:')) continue;
        try {
            return JSON.parse(line.slice('data:'.length).trim());
        } catch {
            return null;
        }
    }
    return null;
}

async function post(endpoint, body, sessionId) {
    const headers = {
        'content-type': 'application/json',
        accept: 'application/json, text/event-stream'
    };
    if (sessionId !== undefined) headers['mcp-session-id'] = sessionId;
    const response = await fetch(endpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
    });
    return { response, text: await response.text() };
}

async function openSession(endpoint) {
    const { response, text } = await post(endpoint, {
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
            protocolVersion: '2025-06-18',
            capabilities: {},
            clientInfo: { name: 'viafrei-freshness', version: '1' }
        }
    });
    if (!response.ok) {
        refuse(`initialize answered HTTP ${response.status}`);
    }
    const parsed = parseBody(text);
    const version = parsed?.result?.serverInfo?.version;
    if (typeof version !== 'string') {
        refuse('initialize returned no serverInfo.version, so the endpoint is not answering as MCP');
    }
    const sessionId = response.headers.get('mcp-session-id');
    if (sessionId === null || sessionId === '') {
        refuse('initialize returned no mcp-session-id, so no tool can be called');
    }
    await post(endpoint, { jsonrpc: '2.0', method: 'notifications/initialized' }, sessionId);
    return { sessionId, version };
}

async function closeSession(endpoint, sessionId) {
    try {
        await fetch(endpoint, {
            method: 'DELETE',
            headers: { 'mcp-session-id': sessionId },
            signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
        });
    } catch {
        // A session we could not delete is untidy, not a freshness defect. The
        // server expires it. Reported by the caller's own summary, never fatal.
    }
}

/**
 * The verdict for one tool, POSITIVE: an answer passes only when it carries a
 * parseable `asOf` within its limit. An unrecognised shape FAILS rather than
 * passing, because the whole point is to notice when the answer changes.
 */
function judge(entry, parsed, now) {
    // A JSON-RPC error is the SERVER saying it could not answer the question —
    // a retired tool, a renamed argument — and that is "could not check", not a
    // stale feed. The first draft fell through to the no-result branch and
    // reported exit 1 STALE on a healthy service while DISCARDING `message`,
    // which is the entire diagnosis. `shape: true` routes it to the refusal.
    if (parsed?.error !== undefined && parsed.error !== null) {
        const { code, message } = parsed.error;
        return {
            ok: false,
            shape: true,
            why: `the server answered a JSON-RPC error ${code}: ${typeof message === 'string' ? message : '(no message)'}`
        };
    }
    const result = parsed?.result;
    if (result === undefined || result === null) {
        return { ok: false, why: 'the response carried no result' };
    }
    if (result.isError === true) {
        return { ok: false, why: 'the tool answered with isError' };
    }
    const meta = result._meta;
    if (meta === undefined || meta === null) {
        return { ok: false, why: 'the answer carried no _meta, so its age cannot be read' };
    }
    if (typeof meta.attribution !== 'string' || meta.attribution === '') {
        return { ok: false, why: 'the answer carried no attribution, which is a licence condition' };
    }
    if (typeof meta.asOf !== 'string') {
        return { ok: false, why: 'the answer carried no asOf, so its age cannot be read' };
    }
    const asOf = Date.parse(meta.asOf);
    if (Number.isNaN(asOf)) {
        return { ok: false, why: `asOf is not a parseable instant: ${JSON.stringify(meta.asOf)}` };
    }
    const ageMinutes = (now - asOf) / 60_000;
    if (ageMinutes > entry.limitMinutes) {
        return {
            ok: false,
            ageMinutes,
            sources: meta.sources,
            why: `data is ${ageMinutes.toFixed(0)} min old, limit is ${entry.limitMinutes} min`
        };
    }
    // A future instant is a clock problem, and reading it as "very fresh" would
    // hide exactly the kind of fault this script exists to notice.
    if (ageMinutes < -5) {
        return { ok: false, ageMinutes, why: `asOf is ${Math.abs(ageMinutes).toFixed(0)} min in the FUTURE` };
    }
    return { ok: true, ageMinutes, sources: meta.sources };
}

/**
 * `main()` was one 90-line function at cognitive complexity 40 — argv, two
 * preconditions, the session, the loop, the parse, two output modes, two filters
 * and three exits. #19 drove this class to zero across this repository and 40 was
 * higher than any of the seven findings that release fixed, so it is split here
 * rather than filed: a smell left on new code becomes the next author's inherited
 * finding the moment they touch the file.
 *
 * The split follows seams the function already had, and every line MOVED rather
 * than being rewritten, which is what makes the 27-case suite a real check on it.
 */
function parseArguments(argv) {
    let endpoint = process.env.FRESHNESS_ENDPOINT ?? DEFAULT_ENDPOINT;
    let asJson = false;
    for (let i = 0; i < argv.length; i += 1) {
        if (argv[i] === '--endpoint') {
            endpoint = argv[i + 1];
            i += 1;
            if (endpoint === undefined) refuse('--endpoint needs a URL');
        } else if (argv[i] === '--json') {
            asJson = true;
        } else {
            refuse(`unknown option ${JSON.stringify(argv[i])}`);
        }
    }
    return { endpoint, asJson };
}

/**
 * Before a single request: a list that asks nothing would report success about
 * nothing, and no fuel tool may be reachable however the list is edited later.
 *
 * The fuel check runs FIRST deliberately. A fuel tool present in both lists is
 * then caught by the arm that gives the LICENCE reason rather than the one that
 * gives a bookkeeping reason, which is the message the next author needs.
 */
function assertWatchList() {
    if (WATCH.length === 0) {
        refuse('the watch list is empty, so this would report success having asked nothing');
    }
    const forbidden = WATCH.filter(entry => FORBIDDEN.test(entry.tool));
    if (forbidden.length > 0) {
        refuse(`the watch list names a fuel tool, which may not be called from a monitor on LICENCE grounds: ${forbidden.map(e => e.tool).join(', ')}`);
    }
    const unlisted = WATCH.filter(entry => !ALLOWED.has(entry.tool));
    if (unlisted.length > 0) {
        refuse(`the watch list names a tool that is not on the allow-list: ${unlisted.map(e => e.tool).join(', ')}. Add it to ALLOWED only after checking the source's own terms.`);
    }
}

async function collectReadings(endpoint, sessionId) {
    const rows = [];
    for (const entry of WATCH) {
        // Deliberately sequential: five concurrent requests to the public
        // endpoint every six hours is load for no benefit.
        // eslint-disable-next-line no-await-in-loop
        const { text } = await post(endpoint, {
            jsonrpc: '2.0',
            id: 9,
            method: 'tools/call',
            params: { name: entry.tool, arguments: entry.args }
        }, sessionId);
        const parsed = parseBody(text);
        if (parsed === null) {
            rows.push({ tool: entry.tool, ok: false, why: 'the response did not parse as JSON or SSE', shape: true });
            continue;
        }
        rows.push({ tool: entry.tool, ...judge(entry, parsed, Date.now()) });
    }
    return rows;
}

/**
 * Three labels, not two. `?????` is "could not measure" and must not read as
 * STALE, which is a claim about the DATA rather than about our ability to see it
 * — the same category error the exit code was making before review caught it.
 */
function rowLabel(row) {
    if (row.ok) return 'ok   ';
    if (row.shape === true) return '?????';
    return 'STALE';
}

function describeRow(row) {
    const age = typeof row.ageMinutes === 'number' ? `${row.ageMinutes.toFixed(0)} min old` : 'age unknown';
    const sources = Array.isArray(row.sources) ? ` [${row.sources.join(', ')}]` : '';
    const why = row.ok ? '' : ` — ${row.why}`;
    return `  ${rowLabel(row)} ${row.tool}: ${age}${sources}${why}`;
}

function report({ endpoint, version, rows, asJson }) {
    if (asJson) {
        console.log(JSON.stringify({ endpoint, version, rows }, null, 2));
        return;
    }
    console.log(`probe-freshness: ${endpoint} reports ${version}`);
    for (const row of rows) {
        console.log(describeRow(row));
    }
}

/** Exits, or returns having found every feed inside its own limit. */
function verdict({ endpoint, rows, asJson }) {
    // A response shape nobody recognises is "could not check", not "stale".
    const unreadable = rows.filter(row => row.shape === true);
    if (unreadable.length > 0) {
        refuse(`${unreadable.length} of ${rows.length} answer(s) could not be read as a measurement — an unparsable body, or the server declining the question. The reason is printed above each one; this is not a statement about the age of any feed.`);
    }
    const bad = rows.filter(row => !row.ok);
    if (bad.length > 0) {
        for (const row of bad) console.error(`  ! ${row.tool}: ${row.why}`);
        fail(`${bad.length} of ${rows.length} feed(s) are stale or malformed on ${endpoint}`);
    }
    // In --json mode stdout carries JSON and nothing else, so a caller can pipe it.
    // The first draft printed this line after the document and made the stream
    // unparseable; the self-test now pins both streams.
    const summary = `probe-freshness: PASS - ${rows.length} feed(s) asked, every one inside its own limit`;
    if (asJson) {
        console.error(summary);
    } else {
        console.log(summary);
    }
}

async function main() {
    const { endpoint, asJson } = parseArguments(process.argv.slice(2));
    assertWatchList();

    const { sessionId, version } = await openSession(endpoint);
    let rows;
    try {
        rows = await collectReadings(endpoint, sessionId);
    } finally {
        await closeSession(endpoint, sessionId);
    }

    report({ endpoint, version, rows, asJson });
    verdict({ endpoint, rows, asJson });
}

// Top-level await rather than a promise chain. Network, DNS, TLS and timeout all
// land here, and all of them are "could not check".
try {
    await main();
} catch (error) {
    refuse(error instanceof Error ? error.message : String(error));
}

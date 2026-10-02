#!/usr/bin/env node
/**
 * The cut-time probe's self-test (#33).
 *
 * The probe is the one thing in this repository that makes a network call, so its
 * self-test must not. Every case here runs against a local stub on the loopback
 * interface, pointed at by a throwaway `catalogue.json` whose `source` is the stub —
 * which is also what proves the probe reads its endpoint from the snapshot rather than
 * from a constant.
 *
 * The case that matters most is the pair that proves the probe tells **wrong** from
 * **dated**. Those are the two real histories: at 1.4.6 the shipped reference omitted a
 * tool the server exposed, which misleads a reader about what they are holding; at
 * 1.4.8 only the version string had moved. They need different remedies, and a probe
 * that reported one as the other would be worse than no probe.
 *
 *   node scripts/probe-catalogue.test.mjs
 */

import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { liveAnswers as stubAnswers, startStub } from './mcp-stub.mjs';
import { nodePath, runToolAsync } from './tools.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
const PROBE = join(HERE, 'probe-catalogue.mjs');

/**
 * The deadline handed to each probe run. Three digits deliberately: a bare four-digit
 * number reads as a port to the leak sweep's number rule, and rephrasing is the right
 * answer there rather than an allow-list entry, which would be permanent. A loopback
 * stub answers in single-digit milliseconds, so this is still generous.
 */
const STUB_TIMEOUT_MS = '900';

let passed = 0;
const failures = [];
const roots = [];

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
    console.error(`probe self-test: CANNOT RUN - ${message}`);
    process.exit(2);
}

/** The real snapshot is the shape every stub answers with, so nothing is hand-written. */
const real = JSON.parse(readFileSync(join(ROOT, 'catalogue.json'), 'utf8'));
for (const key of ['tools', 'resources', 'resourceTemplates', 'prompts', 'serverInfo']) {
    if (real[key] === undefined) refuse(`the real catalogue.json has no ${key}, so the stubs cannot mirror it`);
}

/** The stub lives in `mcp-stub.mjs`; this binds it to the real snapshot read above. */
const liveAnswers = overrides => stubAnswers(real, overrides);

/** A throwaway root whose catalogue.json points at `url`, optionally distorted. */
function rootFor(url, mutate = () => {}) {
    const root = mkdtempSync(join(tmpdir(), 'viafrei-probe-'));
    roots.push(root);
    const snapshot = JSON.parse(JSON.stringify(real));
    snapshot.source = url;
    mutate(snapshot);
    writeFileSync(join(root, 'catalogue.json'), JSON.stringify(snapshot, null, 2));
    return root;
}

/**
 * ASYNCHRONOUS on purpose. `runTool` is synchronous and blocks this process's event
 * loop, so the stub served from this very process could not accept the child's
 * connection: every case timed out and looked like a broken probe. That is what
 * `runToolAsync` exists for.
 */
async function run(root, extra = []) {
    try {
        const out = await runToolAsync(nodePath(), [PROBE, ...extra], {
            encoding: 'utf8',
            env: { ...process.env, PROBE_ROOT: root, PROBE_TIMEOUT_MS: STUB_TIMEOUT_MS }
        });
        return { status: 0, out };
    } catch (error) {
        return { status: error.status ?? -1, out: `${error.stdout ?? ''}${error.stderr ?? ''}` };
    }
}

/** One case: start a stub, run the probe, close the stub. */
async function withStub(answers, body, mutate) {
    const stub = await startStub(answers);
    try {
        return await body(rootFor(stub.url, mutate), stub);
    } finally {
        await stub.close();
    }
}

// --- green: a stub that mirrors the snapshot ----------------------------------------
await withStub(liveAnswers(), async root => {
    const result = await run(root);
    check(
        'a server matching the snapshot passes, and the run prints what it read',
        result.status === 0
        && /PASS - the snapshot matches the running server/u.test(result.out)
        && new RegExp(`${real.tools.length} tools`, 'u').test(result.out),
        `status ${result.status}, out ${JSON.stringify(result.out.slice(0, 200))}`
    );
});

// --- WRONG: the 1.4.6 history. A tool the snapshot never mentions. -------------------
await withStub(
    liveAnswers({
        'tools/list': {
            result: {
                tools: [
                    ...liveAnswers()['tools/list'].result.tools,
                    {
                        name: 'find_something_new',
                        description: 'a tool the server gained',
                        inputSchema: { $schema: 'x', type: 'object', properties: {}, required: [] },
                        annotations: { readOnlyHint: true },
                        execution: { taskSupport: 'forbidden' }
                    }
                ]
            }
        }
    }),
    async root => {
        const result = await run(root);
        check(
            'a tool the snapshot lacks is reported as WRONG, not dated',
            result.status === 1
            && /the snapshot is WRONG about this server, not merely dated/u.test(result.out)
            && /the server has find_something_new, the snapshot does not/u.test(result.out),
            `status ${result.status}, out ${JSON.stringify(result.out.slice(0, 280))}`
        );
    }
);

// --- WRONG: a changed description, which is the subtler half of the same history -----
await withStub(
    liveAnswers({
        'tools/list': {
            result: {
                tools: liveAnswers()['tools/list'].result.tools.map((tool, index) => (
                    index === 0 ? { ...tool, description: 'a rewritten description' } : tool
                ))
            }
        }
    }),
    async root => {
        const result = await run(root);
        check(
            'a changed description is reported as WRONG and names the tool',
            result.status === 1
            && /is WRONG about this server/u.test(result.out)
            && new RegExp(`${real.tools[0].name} differs`, 'u').test(result.out),
            `status ${result.status}, out ${JSON.stringify(result.out.slice(0, 280))}`
        );
    }
);

// --- DATED: the 1.4.8 history. Only the version moved. -------------------------------
await withStub(liveAnswers(), async root => {
    const result = await run(root);
    check(
        'a version-only difference is reported as DATED, not wrong',
        result.status === 1
        && /the snapshot is DATED/u.test(result.out)
        && /The surface is unchanged/u.test(result.out)
        && !/is WRONG about this server/u.test(result.out),
        `status ${result.status}, out ${JSON.stringify(result.out.slice(0, 280))}`
    );
}, snapshot => {
    snapshot.serverInfo = { ...snapshot.serverInfo, version: '0.0.1-older' };
});

// --- refusals: exit 2, never confusable with agreement -------------------------------
await withStub(liveAnswers({ 'tools/list': { result: { tools: [] } } }), async root => {
    const result = await run(root);
    check(
        'an EMPTY tool list is refused, because it must not compare equal to a stored one',
        result.status === 2 && /returned no tools/u.test(result.out),
        `status ${result.status}, out ${JSON.stringify(result.out.slice(0, 220))}`
    );
});

await withStub(liveAnswers({ 'prompts/list': { error: { code: -1, message: 'nope' } } }), async root => {
    const result = await run(root);
    check(
        'a server that refuses a list call is a refusal, not a difference',
        result.status === 2 && /was refused by the server/u.test(result.out),
        `status ${result.status}, out ${JSON.stringify(result.out.slice(0, 220))}`
    );
});

await withStub(liveAnswers({ initialize: { result: { capabilities: {} } } }), async root => {
    const result = await run(root);
    check(
        'an initialize with no serverInfo.version is refused rather than judged',
        result.status === 2 && /no serverInfo\.version/u.test(result.out),
        `status ${result.status}, out ${JSON.stringify(result.out.slice(0, 220))}`
    );
});

{
    // An endpoint nothing is listening on. The stub is started and closed first, so the
    // port is real and refused rather than merely unlikely.
    const stub = await startStub(liveAnswers());
    const url = stub.url;
    await stub.close();
    const result = await run(rootFor(url));
    check(
        'an unreachable endpoint is refused with exit 2',
        result.status === 2 && /could not reach/u.test(result.out),
        `status ${result.status}, out ${JSON.stringify(result.out.slice(0, 220))}`
    );
}

{
    const root = mkdtempSync(join(tmpdir(), 'viafrei-probe-'));
    roots.push(root);
    const snapshot = JSON.parse(JSON.stringify(real));
    delete snapshot.source;
    writeFileSync(join(root, 'catalogue.json'), JSON.stringify(snapshot, null, 2));
    const result = await run(root);
    check(
        'a snapshot naming no source is refused — there is no endpoint to probe',
        result.status === 2 && /names no source/u.test(result.out),
        `status ${result.status}, out ${JSON.stringify(result.out.slice(0, 200))}`
    );
}

// --- --write: it rewrites, and the rewrite then AGREES -------------------------------
//
// The second run is the point: a writer that produced a shape the comparator rejects
// would be worse than no writer, and only running the probe again proves it does not.
await withStub(liveAnswers(), async root => {
    const first = await run(root);
    const wrote = (await run(root, ['--write'])).out;
    const second = await run(root);
    const after = JSON.parse(readFileSync(join(root, 'catalogue.json'), 'utf8'));
    check(
        '--write turns a DATED snapshot into one the probe accepts, keeping its shape',
        first.status === 1
        && /catalogue\.json rewritten/u.test(wrote)
        && second.status === 0
        && Object.keys(after).join(',') === Object.keys(real).join(',')
        && !JSON.stringify(after).includes('"$schema"'),
        `first ${first.status}, second ${second.status}, keys ${Object.keys(after).join(',')}`
    );
}, snapshot => {
    snapshot.serverInfo = { ...snapshot.serverInfo, version: '0.0.1-older' };
});

for (const root of roots) rmSync(root, { recursive: true, force: true });

console.log('');
if (failures.length > 0) {
    console.error(`probe self-test: FAIL - ${failures.length} of ${passed + failures.length} case(s)`);
    for (const failure of failures) console.error(`  - ${failure}`);
    process.exit(1);
}
console.log(`probe self-test: PASS - ${passed} cases, every one against a local stub on loopback`);

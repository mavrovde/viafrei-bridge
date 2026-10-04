#!/usr/bin/env node
/**
 * The release proposer's self-test. Hermetic: the "server" and the "registry" are two
 * stubs on loopback, and every run happens in a throwaway copy of this repository, so
 * the script's writes — `npm version`, the probe's `--write`, the regenerated reference,
 * the CHANGELOG block — land in a directory that is deleted afterwards.
 *
 * What is pinned, and why each one earns its place:
 *
 *   - the four states, each from the three readings that produce it, because the
 *     workflow branches on `state=` and a state that is never produced is a branch that
 *     is never taken;
 *   - that DETECT WRITES NOTHING, by hashing the six files before and after — a detect
 *     that bumped the manifest would make every later run read "awaiting-tag";
 *   - the whole prepared tree for a DATED server: all three version fields, the snapshot,
 *     the reference, the CHANGELOG block's place, lead and link reference, and that the
 *     gates then pass on what was written;
 *   - the WRONG case, where the lead names what moved and asks for a person, and the
 *     fuel case, where `check:sources` fails and the proposal is a draft rather than a
 *     failure — information for the pull request, not a reason to lose the work;
 *   - every refusal path at exit 2, never confusable with a decision: an unreachable or
 *     malformed registry, a prerelease on either side, a CHANGELOG already carrying the
 *     block, bad arguments;
 *   - the cache defeats on the registry read, which is the one network claim this script
 *     makes about itself;
 *   - one mutant: with the version guard removed, a prerelease on the server is no longer
 *     refused — proving the guard is the thing standing between a network string and an
 *     `npm version` argument.
 *
 *   node scripts/propose-release.test.mjs
 */

import { createServer } from 'node:http';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { createChecker } from './check-harness.mjs';
import { missingFixtureImports } from './fixture-root.mjs';
import { liveAnswers, startStub } from './mcp-stub.mjs';
import { nodePath, runToolAsync } from './tools.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');

/** Three digits deliberately, as in the probe's self-test: four read as a port to the leak sweep. */
const STUB_TIMEOUT_MS = '900';
const MIN_CASES = 30;

const real = JSON.parse(readFileSync(join(ROOT, 'catalogue.json'), 'utf8'));
const PUBLISHED = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')).version;
// Derived from the manifest so the fixtures stay ahead of it whatever version ships here:
// the next minor is the server moving on, and the version BEHIND is the registry ahead.
const [MAJOR, MINOR] = PUBLISHED.split('.').map(Number);
const NEXT = `${MAJOR}.${MINOR + 1}.0`;
const OLDER = `${MAJOR}.${MINOR}.0` === PUBLISHED ? `${Math.max(MAJOR - 1, 0)}.0.1` : `${MAJOR}.${MINOR}.0`;
const FILES = ['package.json', 'package-lock.json', 'catalogue.json', 'API.md', 'README.md', 'CHANGELOG.md'];

const { check, failures, passed } = createChecker();
const roots = [];

function refuse(message) {
    console.error(`propose self-test: CANNOT RUN - ${message}`);
    process.exit(2);
}

if (!/^\d+\.\d+\.\d+$/u.test(PUBLISHED)) refuse(`package.json's version ${PUBLISHED} is not X.Y.Z, so the fixtures cannot be built from it`);
// An ORDERING, not an equality: the constant this replaced was `1.5.0`, and at 1.5.4 it was
// unequal to the manifest and yet below it, so two cases quietly flipped to `behind`.
// Deliberately NOT imported from the script under test: a precondition that borrowed its
// comparison would pass exactly when that comparison was broken.
const compareVersions = (a, b) => {
    const [left, right] = [a, b].map(v => v.split('.').map(Number));
    for (let i = 0; i < 3; i += 1) if (left[i] !== right[i]) return left[i] - right[i];
    return 0;
};
if (!(compareVersions(OLDER, PUBLISHED) < 0 && compareVersions(PUBLISHED, NEXT) < 0)) {
    refuse(`the fixture versions must bracket the real one, and ${OLDER} < ${PUBLISHED} < ${NEXT} does not hold`);
}

// --- the registry stub ---------------------------------------------------------------
function startRegistry({ latest = PUBLISHED, status = 200, raw = null } = {}) {
    const seen = [];
    const server = createServer((request, response) => {
        seen.push({ url: request.url, headers: request.headers });
        response.writeHead(status, { 'content-type': 'application/json' });
        response.end(raw ?? JSON.stringify({ name: 'viafrei', 'dist-tags': { latest } }));
    });
    return new Promise(resolve => {
        server.listen(0, '127.0.0.1', () => {
            const { port } = server.address();
            resolve({
                url: `http://127.0.0.1:${port}/viafrei`,
                seen,
                close: () => new Promise(done => {
                    server.closeAllConnections();
                    server.close(() => done());
                })
            });
        });
    });
}

/** The real surface, with the server saying `serverVersion`. */
function serverAnswers(serverVersion, overrides = {}) {
    const answers = liveAnswers(real);
    answers.initialize = { result: { ...answers.initialize.result, serverInfo: { ...real.serverInfo, version: serverVersion } } };
    return { ...answers, ...overrides };
}

// --- a throwaway copy of the repository --------------------------------------------
function buildRoot(mcpUrl, { manifestVersion = PUBLISHED, changelog = null, capturedAt = null } = {}) {
    const root = mkdtempSync(join(tmpdir(), 'viafrei-propose-'));
    roots.push(root);
    mkdirSync(join(root, 'scripts'));
    for (const file of readdirSync(join(ROOT, 'scripts'))) {
        if ((file.endsWith('.mjs') && !file.endsWith('.test.mjs')) || file.endsWith('.json')) {
            copyFileSync(join(ROOT, 'scripts', file), join(root, 'scripts', file));
        }
    }
    const missing = missingFixtureImports(root);
    if (missing.length > 0) refuse(`the fixture is incomplete: ${missing.join('; ')}`);

    const manifest = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
    manifest.version = manifestVersion;
    writeFileSync(join(root, 'package.json'), `${JSON.stringify(manifest, null, 2)}\n`);
    const lock = JSON.parse(readFileSync(join(ROOT, 'package-lock.json'), 'utf8'));
    lock.version = manifestVersion;
    lock.packages[''].version = manifestVersion;
    writeFileSync(join(root, 'package-lock.json'), `${JSON.stringify(lock, null, 2)}\n`);
    const snapshot = JSON.parse(JSON.stringify(real));
    snapshot.source = mcpUrl;
    snapshot.serverInfo = { ...snapshot.serverInfo, version: manifestVersion };
    if (capturedAt !== null) snapshot.capturedAt = capturedAt;
    writeFileSync(join(root, 'catalogue.json'), `${JSON.stringify(snapshot, null, 2)}\n`);
    copyFileSync(join(ROOT, 'API.md'), join(root, 'API.md'));
    copyFileSync(join(ROOT, 'README.md'), join(root, 'README.md'));
    copyFileSync(join(ROOT, 'SOURCES.md'), join(root, 'SOURCES.md'));
    if (changelog === null) {
        copyFileSync(join(ROOT, 'CHANGELOG.md'), join(root, 'CHANGELOG.md'));
    } else {
        writeFileSync(join(root, 'CHANGELOG.md'), changelog);
    }
    return root;
}

function readOut(file) {
    try {
        return Object.fromEntries(readFileSync(file, 'utf8').trim().split('\n').map(line => line.split('=', 2)));
    } catch {
        return {};
    }
}

async function run(root, registryUrl, args = []) {
    const out = join(root, 'out.env');
    const body = join(root, 'body.md');
    try {
        const stdout = await runToolAsync(nodePath(), [join(root, 'scripts', 'propose-release.mjs'), '--out', out, '--body', body, ...args], {
            encoding: 'utf8',
            env: { ...process.env, PROPOSE_REGISTRY_URL: registryUrl, PROBE_TIMEOUT_MS: STUB_TIMEOUT_MS }
        });
        return { status: 0, text: stdout, out: readOut(out), body: readIfPresent(body) };
    } catch (error) {
        return { status: error.status ?? -1, text: `${error.stdout ?? ''}${error.stderr ?? ''}`, out: readOut(out), body: readIfPresent(body) };
    }
}

function readIfPresent(file) {
    try {
        return readFileSync(file, 'utf8');
    } catch {
        return null;
    }
}

/** One case: a server stub, a registry stub, a fixture, the run; everything closed after. */
async function scenario({ server = PUBLISHED, registry = {}, root: rootOptions = {}, serverOverrides = {} }, body) {
    const stub = await startStub(serverAnswers(server, serverOverrides));
    const reg = await startRegistry(registry);
    try {
        const root = buildRoot(stub.url, rootOptions);
        await body({ root, stub, reg, run: args => run(root, reg.url, args) });
    } finally {
        await stub.close();
        await reg.close();
    }
}

function fileHashes(root) {
    return FILES.map(file => readFileSync(join(root, file), 'utf8')).join('\n---\n');
}

const brief = text => JSON.stringify(text.slice(0, 300));

// --- state: in-sync ------------------------------------------------------------------
await scenario({}, async ({ run, reg }) => {
    const result = await run();
    check(
        'server == registry == main is in-sync, exit 0, both numbers printed',
        result.status === 0 && result.out.state === 'in-sync' && result.out.version === PUBLISHED && result.out.npm === PUBLISHED
        && new RegExp(`server ${PUBLISHED}, registry ${PUBLISHED}`, 'u').test(result.text),
        `status ${result.status}, out ${brief(result.text)}`
    );
    const request = reg.seen[0];
    check(
        'the registry read defeats both caches: a no-cache header and a unique query string',
        request !== undefined && request.headers['cache-control'] === 'no-cache' && /\?nocache=\d+-\d+/u.test(request.url),
        JSON.stringify(request?.headers['cache-control'] ?? null) + ' ' + JSON.stringify(request?.url ?? null)
    );
});

// --- state: drift, detect only --------------------------------------------------------
await scenario({ server: NEXT }, async ({ run, root }) => {
    const before = fileHashes(root);
    const result = await run();
    check(
        `server ${NEXT} ahead of registry ${PUBLISHED} with main at ${PUBLISHED} is drift, exit 0`,
        result.status === 0 && result.out.state === 'drift' && result.out.version === NEXT && result.out.npm === PUBLISHED && result.out.manifest === PUBLISHED,
        `status ${result.status}, out ${JSON.stringify(result.out)}`
    );
    check('detect writes nothing: all six files are byte-identical afterwards', fileHashes(root) === before);
    check('detect writes no pull-request body', result.body === null);
});

// --- state: awaiting-tag ----------------------------------------------------------------
await scenario({ server: NEXT, root: { manifestVersion: NEXT } }, async ({ run }) => {
    const result = await run();
    check(
        'main already at the server version while the registry lags is awaiting-tag, exit 0',
        result.status === 0 && result.out.state === 'awaiting-tag' && /the tag is the missing step/u.test(result.text),
        `status ${result.status}, out ${brief(result.text)}`
    );
    const prepared = await run(['--prepare']);
    check(
        '--prepare on awaiting-tag is exit 1 ("nothing to prepare"), not a second preparation',
        prepared.status === 1 && /nothing to prepare/u.test(prepared.text) && prepared.out.state === 'awaiting-tag',
        `status ${prepared.status}, out ${brief(prepared.text)}`
    );
});

// --- state: behind -----------------------------------------------------------------------
await scenario({ server: OLDER, registry: { latest: PUBLISHED } }, async ({ run }) => {
    const result = await run();
    check(
        'a server BEHIND the registry is exit 1 and names both numbers; no downgrade is proposed',
        result.status === 1 && result.out.state === 'behind' && result.text.includes(OLDER) && /AHEAD of the service/u.test(result.text),
        `status ${result.status}, out ${brief(result.text)}`
    );
});

// --- prepare: the DATED server (the 1.4.8 → 1.4.9 history), captured on an earlier day --------
await scenario({ server: NEXT, root: { capturedAt: '2026-09-29' } }, async ({ run, root }) => {
    const result = await run(['--prepare', '--date', '2026-10-02']);
    check(
        'a dated server is PREPARED: exit 0, state=proposed, verdict=dated, gates pass, not a draft',
        result.status === 0 && result.out.state === 'proposed' && result.out.verdict === 'dated'
        && result.out.gates === 'pass' && result.out.draft === 'false' && result.out.version === NEXT,
        `status ${result.status}, out ${JSON.stringify(result.out)} ${brief(result.text)}`
    );
    const manifest = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
    const lock = JSON.parse(readFileSync(join(root, 'package-lock.json'), 'utf8'));
    check(
        'all three version fields now say the server version',
        manifest.version === NEXT && lock.version === NEXT && lock.packages[''].version === NEXT,
        `${manifest.version} ${lock.version} ${lock.packages['']?.version}`
    );
    const snapshot = JSON.parse(readFileSync(join(root, 'catalogue.json'), 'utf8'));
    check('catalogue.json was re-captured: serverInfo.version moved and the tool count is unchanged',
        snapshot.serverInfo.version === NEXT && snapshot.tools.length === real.tools.length);
    check('API.md was regenerated from the new snapshot', readFileSync(join(root, 'API.md'), 'utf8').includes(NEXT));
    check('the README catalogue section was regenerated from the new snapshot', readFileSync(join(root, 'README.md'), 'utf8').includes(`server ${NEXT}`));

    const changelog = readFileSync(join(root, 'CHANGELOG.md'), 'utf8');
    const lines = changelog.split('\n');
    const unreleased = lines.indexOf('## [Unreleased]');
    const block = lines.indexOf(`## [${NEXT}] - 2026-10-02`);
    const previousBlock = lines.findIndex(line => line.startsWith(`## [${PUBLISHED}]`));
    check('the new block sits directly below an emptied [Unreleased]', unreleased !== -1 && block === unreleased + 2, `${unreleased} ${block}`);
    // Matched over collapsed whitespace: the lead is wrapped, so a phrase may cross a line break.
    const flat = changelog.replace(/\s+/gu, ' ');
    check('the lead says it mirrors the server and that the surface is unchanged',
        /\*\*Mirrors the server\.\*\*/u.test(lines.slice(block, block + 12).join(' ')) && /surface \*\*unchanged\*\*/u.test(flat));
    check(
        'a snapshot captured on an EARLIER day: the lead says the capture date moved, and the body agrees',
        /only the version string and the capture date moved/u.test(flat) && /surface \*\*unchanged\*\* — only the version string and the capture date moved/u.test(result.body ?? ''),
        brief(flat)
    );
    const waiting = readFileSync(join(ROOT, 'CHANGELOG.md'), 'utf8').split('\n');
    const firstWaitingLine = waiting.slice(waiting.indexOf('## [Unreleased]') + 1).find(line => line.trim() !== '' && !line.startsWith('## ['));
    check(
        "what was waiting under [Unreleased] now sits under the new block, not above it",
        firstWaitingLine !== undefined && lines.indexOf(firstWaitingLine) > block && lines.indexOf(firstWaitingLine) < previousBlock,
        `first waiting line at ${lines.indexOf(firstWaitingLine ?? '')}, block at ${block}`
    );
    check('the link reference was added exactly once, above the previous one',
        changelog.split(`[${NEXT}]: https://github.com/mavrovde/viafrei-mcp/releases/tag/v${NEXT}`).length === 2
        && lines.indexOf(`[${NEXT}]: https://github.com/mavrovde/viafrei-mcp/releases/tag/v${NEXT}`) < lines.findIndex(line => line.startsWith(`[${PUBLISHED}]: `)));
    check('the previous version block is still there, after the new one', previousBlock > block, `${previousBlock} ${block}`);
    check(
        'the pull-request body names both numbers, every gate, and the three acts left to a person',
        result.body !== null && result.body.includes(`**${NEXT}**`) && result.body.includes(`**${PUBLISHED}**`)
        && /check:versions.*PASS/u.test(result.body) && /check:docs.*PASS/u.test(result.body) && /check:sources.*PASS/u.test(result.body)
        && result.body.includes(`git tag v${NEXT}`) && /never a squash/u.test(result.body),
        brief(result.body ?? '')
    );
    check('files= lists exactly the six files the workflow may stage', result.out.files === FILES.join(','));

    const again = await run(['--prepare', '--date', '2026-10-02']);
    check(
        'preparing the same tree again is "nothing to prepare" (exit 1): main now equals the server, so the state is awaiting-tag',
        again.status === 1 && again.out.state === 'awaiting-tag' && /nothing to prepare/u.test(again.text),
        `status ${again.status}, out ${brief(again.text)}`
    );
});

// --- prepare: a second release on the SAME day — the capture date does not move -------------
const today = new Date().toISOString().slice(0, 10);
// Twice: over this repository's own history, and over a history whose previous block already
// says the capture date MOVED — the shape that held release/1.5.10 red (#45), because a mirror
// block has no `###` section and the lead slice used to run on into the blocks below it.
const movedHistory = [
    '# Changelog', '', '## [Unreleased]', '',
    `## [${PUBLISHED}] - 2026-10-01`, '',
    '**Mirrors the server.** The probe reported the surface **unchanged** — only the version',
    'string and the capture date moved.', '',
    `[${PUBLISHED}]: https://github.com/mavrovde/viafrei-mcp/releases/tag/v${PUBLISHED}`, ''
].join('\n');
const sameDayHistories = [
    ['this repository', null],
    ['a previous block whose capture date moved', movedHistory]
];
for (const [history, changelog] of sameDayHistories) {
    await scenario({ server: NEXT, root: { capturedAt: today, changelog } }, async ({ run, root }) => {
        const result = await run(['--prepare', '--date', '2026-10-02']);
        // Judged on the LEAD alone — from the new heading to the next section or version heading:
        // the carried [Unreleased] text and the older blocks may quote the other sentence (this
        // repository's own changelog does), so neither the whole file nor the tail is the oracle.
        const flat = readFileSync(join(root, 'CHANGELOG.md'), 'utf8').replace(/\s+/gu, ' ');
        const leadText = flat.split(`## [${NEXT}]`)[1]?.split(/###|## \[/u)[0] ?? '';
        // The expectation is read off what HAPPENED: the fixture was dated a few seconds before the
        // probe wrote, so a run crossing UTC midnight between the two legitimately moves the date.
        const written = JSON.parse(readFileSync(join(root, 'catalogue.json'), 'utf8')).capturedAt;
        const sameDay = written === today;
        const expected = sameDay ? 'only the version string moved; the capture date is the same day' : 'only the version string and the capture date moved';
        const forbidden = sameDay ? 'capture date moved' : 'is the same day';
        check(
            `a snapshot captured TODAY, over ${history}: the lead and the body say what happened (${sameDay ? 'same day' : 'the run crossed midnight'})`,
            result.status === 0 && result.out.verdict === 'dated'
            && leadText.includes(expected) && !leadText.includes(forbidden)
            && (result.body ?? '').includes(`surface **unchanged** — ${expected}`),
            `status ${result.status}, ${brief(leadText)} ${brief(result.body ?? '')}`
        );
    });
}

// --- prepare: the WRONG server (the 1.4.6 history) ------------------------------------------
const extraTool = {
    name: 'find_something_new',
    description: 'a tool the server gained',
    inputSchema: { $schema: 'x', type: 'object', properties: {}, required: [] },
    annotations: { readOnlyHint: true },
    execution: { taskSupport: 'forbidden' }
};
await scenario({
    server: NEXT,
    serverOverrides: { 'tools/list': { result: { tools: [...liveAnswers(real)['tools/list'].result.tools, extraTool] } } }
}, async ({ run, root }) => {
    const result = await run(['--prepare', '--date', '2026-10-02']);
    check(
        'a changed surface is prepared as a DRAFT with verdict=wrong, exit 0',
        result.status === 0 && result.out.state === 'proposed' && result.out.verdict === 'wrong' && result.out.draft === 'true',
        `status ${result.status}, out ${JSON.stringify(result.out)} ${brief(result.text)}`
    );
    const flat = readFileSync(join(root, 'CHANGELOG.md'), 'utf8').replace(/\s+/gu, ' ');
    check(
        'the CHANGELOG lead says CHANGED, names the tool, and asks for a person',
        /surface \*\*CHANGED\*\*/u.test(flat) && /find_something_new/u.test(flat) && /A person must describe the change/u.test(flat),
        brief(flat)
    );
    check('the body carries the surface section with the difference',
        result.body !== null && /The surface changed/u.test(result.body) && /find_something_new/u.test(result.body));
    check(
        'a new tool moves the count the sources page states, so check:sources fails on the COUNT sentence and not on the licence arm',
        result.out.gates === 'fail' && result.body !== null && /check:sources.*\*\*FAIL\*\*/u.test(result.body)
        && /SOURCES\.md says .* but catalogue\.json gives/u.test(result.body)
        && !/reaches the rate-limited fuel source/u.test(result.body),
        `${JSON.stringify(result.out)} ${brief(result.body ?? '')}`
    );
});

// --- prepare: a NEW FUEL TOOL — the licence case — makes check:sources fail, draft, not lost ---
const fuelTool = { ...extraTool, name: 'find_fuel_nearby', description: 'fuel prices from Tankerkönig / MTS-K' };
await scenario({
    server: NEXT,
    serverOverrides: { 'tools/list': { result: { tools: [...liveAnswers(real)['tools/list'].result.tools, fuelTool] } } }
}, async ({ run }) => {
    const result = await run(['--prepare', '--date', '2026-10-02']);
    check(
        'a fuel tool the sources page does not name: prepared, check:sources FAILS, gates=fail, draft',
        result.status === 0 && result.out.state === 'proposed' && result.out.gates === 'fail' && result.out.draft === 'true'
        && /FAIL {2}check:sources/u.test(result.text),
        `status ${result.status}, out ${JSON.stringify(result.out)} ${brief(result.text)}`
    );
    check('the body shows the failing gate and ITS reason: the licence sentence naming the tool',
        result.body !== null && /check:sources.*\*\*FAIL\*\*/u.test(result.body)
        && /find_fuel_nearby reaches the rate-limited fuel source/u.test(result.body),
        brief(result.body ?? ''));
    // A new tool has no README group yet: the proposal still happens, as a draft, and
    // check:readme is the gate that says which tool needs one — never a refusal.
    check('a new tool leaves check:readme FAILING and names the tool, instead of refusing the proposal',
        /FAIL {2}check:readme/u.test(result.text) && result.body !== null && /in no README group: find_fuel_nearby/u.test(result.body),
        brief(result.body ?? result.text));
});

// --- refusals: exit 2, never a decision ------------------------------------------------------
await scenario({ server: NEXT, root: { changelog: `# Changelog\n\n## [Unreleased]\n\n## [${NEXT}] - 2026-01-01\n\nalready\n\n## [${PUBLISHED}] - 2025-01-01\n\n[${PUBLISHED}]: x\n` } }, async ({ run }) => {
    const result = await run(['--prepare']);
    check(
        'a CHANGELOG already carrying the block refuses (exit 2) — a release is prepared once',
        result.status === 2 && /already carries a block/u.test(result.text),
        `status ${result.status}, out ${brief(result.text)}`
    );
});

await scenario({ server: NEXT, root: { changelog: '# Changelog\n\nno history here\n' } }, async ({ run }) => {
    const result = await run(['--prepare']);
    check(
        'a CHANGELOG without [Unreleased] + a version block refuses rather than guessing where to write',
        result.status === 2 && /does not open its history/u.test(result.text),
        `status ${result.status}, out ${brief(result.text)}`
    );
});

await scenario({ server: '1.5.0-rc.1' }, async ({ run }) => {
    const result = await run();
    check(
        'a prerelease on the server is refused (exit 2) before it reaches anything',
        result.status === 2 && /serverInfo\.version is "1\.5\.0-rc\.1", not a release version/u.test(result.text),
        `status ${result.status}, out ${brief(result.text)}`
    );
});

await scenario({ registry: { latest: 'next' } }, async ({ run }) => {
    const result = await run();
    check(
        'a registry latest that is not X.Y.Z is refused (exit 2)',
        result.status === 2 && /dist-tags\.latest is "next"/u.test(result.text),
        `status ${result.status}, out ${brief(result.text)}`
    );
});

await scenario({ registry: { raw: '{"name":"viafrei"}' } }, async ({ run }) => {
    const result = await run();
    check(
        'a registry document with no dist-tags is refused, not read as "nothing published"',
        result.status === 2 && /dist-tags\.latest is undefined/u.test(result.text),
        `status ${result.status}, out ${brief(result.text)}`
    );
});

await scenario({ registry: { raw: 'not json' } }, async ({ run }) => {
    const result = await run();
    check('an unparsable registry answer is refused', result.status === 2 && /is not JSON/u.test(result.text), `status ${result.status}, out ${brief(result.text)}`);
});

await scenario({ registry: { status: 503 } }, async ({ run }) => {
    const result = await run();
    check('a registry error status is refused and named', result.status === 2 && /answered 503/u.test(result.text), `status ${result.status}, out ${brief(result.text)}`);
});

{
    // A registry nothing is listening on: started and closed, so the port is real and refused.
    const reg = await startRegistry();
    const url = reg.url;
    await reg.close();
    await scenario({}, async ({ root }) => {
        const result = await run(root, url);
        check('an unreachable registry is refused (exit 2)', result.status === 2 && /registry could not be read/u.test(result.text), `status ${result.status}, out ${brief(result.text)}`);
    });
}

{
    const stub = await startStub(serverAnswers(NEXT));
    const url = stub.url;
    await stub.close();
    const reg = await startRegistry();
    try {
        const result = await run(buildRoot(url), reg.url);
        check(
            'an unreachable server is refused through the probe (exit 2), never read as a version',
            result.status === 2 && /catalogue probe could not read the server/u.test(result.text),
            `status ${result.status}, out ${brief(result.text)}`
        );
    } finally {
        await reg.close();
    }
}

await scenario({}, async ({ run }) => {
    const unknown = await run(['--bogus']);
    check('an unknown option is a usage refusal (exit 2)', unknown.status === 2 && /unknown option --bogus/u.test(unknown.text), brief(unknown.text));
    const date = await run(['--prepare', '--date', '2nd October']);
    check('a malformed --date is refused before any read', date.status === 2 && /--date must be YYYY-MM-DD/u.test(date.text), brief(date.text));
    const dangling = await run(['--out']);
    check('--out with no value is refused', dangling.status === 2 && /--out needs a value/u.test(dangling.text), brief(dangling.text));
});

// --- the mutant: the version guard is what stands between the network and `npm version` --
await scenario({ server: '1.5.0-rc.1' }, async ({ run, root }) => {
    const path = join(root, 'scripts', 'propose-release.mjs');
    const source = readFileSync(path, 'utf8');
    const marker = 'if (match === null) {';
    if (!source.includes(marker)) refuse('the version guard is not the shape this case mutates, so it is untested');
    writeFileSync(path, source.replace(marker, 'if (false) {'));
    const result = await run();
    // Positive and negative halves: the refusal sentence is gone AND the prerelease is then
    // dereferenced as the match it did not produce, which throws inside version() itself. A
    // pure negative would also be satisfied by an unreachable stub, and would say nothing
    // about where the string went instead.
    check(
        'MUTANT: with the version guard removed, the prerelease is not refused by name — version() dereferences a match that is not there and crashes, which is why the guard comes first',
        !/not a release version/u.test(result.text) && result.status !== 0 && result.status !== 2
        && /TypeError/u.test(result.text) && /at version \(/u.test(result.text),
        `status ${result.status}, out ${brief(result.text)}`
    );
});

// --- verdict --------------------------------------------------------------------------------
// PROPOSE_TEST_KEEP=1 leaves the fixtures on disk and prints them, for reading a prepared tree by hand.
if (process.env.PROPOSE_TEST_KEEP === '1') {
    for (const root of roots) console.log(`  kept ${root}`);
} else {
    for (const root of roots) rmSync(root, { recursive: true, force: true });
}

if (failures.length > 0) {
    console.error(`\npropose self-test: FAIL - ${failures.length} of ${passed() + failures.length} case(s)`);
    for (const failure of failures) console.error(`  - ${failure}`);
    process.exit(1);
}
if (passed() < MIN_CASES) {
    console.error(`propose self-test: CANNOT TRUST - only ${passed()} case(s) ran, floor is ${MIN_CASES}`);
    process.exit(2);
}
console.log(`\npropose self-test: PASS - ${passed()} cases, every one against two local stubs on loopback`);

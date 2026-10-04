#!/usr/bin/env node
/**
 * Does the registry still match the server — and if not, PREPARE the release that
 * would make it match. Prepare, never perform.
 *
 * WHY THIS EXISTS. This package is versioned to match the ViaFrei MCP server it relays
 * to, so `npx viafrei@X.Y.Z` and the endpoint are one number rather than two. Prod moves
 * on its own schedule, and until now the only thing that noticed the registry falling
 * behind was a person checking by hand: 1.4.9 sat on prod while npm said 1.4.8 until
 * somebody asked. Every step of catching up was mechanical, and the same every time —
 * bump the manifest, re-capture the snapshot, regenerate the reference, write the
 * CHANGELOG block, run the gates — so it is done here, by the `Version sync` workflow,
 * and lands as a pull request.
 *
 * WHAT IT WILL NOT DO, and this is the design rather than a limit: this script never
 * merges, tags or publishes. When the server's SURFACE changed — not just its number —
 * the release note needs a sentence about what the change means, which nothing here can
 * write: the 1.4.9 cut carried a licence-relevant fix for exactly that case (a second fuel
 * tool the sources page had not named). An npm version is immutable, so a wrong one can
 * never be reissued under that number. So the output is a branch and a pull request.
 *
 * What happens to that pull request is the workflow's decision (owner, 2026-10-04): a
 * PURE MIRROR — surface unchanged, every gate here passed, the leak sweep clean — is
 * merged, tagged and published by the `Version sync` workflow once its required checks
 * are green (`scripts/auto-release.mjs` holds those decisions). Anything else stays a
 * person's: the verdict, the merge, the tag.
 *
 *   node scripts/propose-release.mjs [--out <file>]                        # detect only
 *   node scripts/propose-release.mjs --prepare [--out <file>] [--body <file>] [--date YYYY-MM-DD]
 *
 * Detect reads two things over the network and writes NOTHING: the running server's
 * `serverInfo.version` (through the catalogue probe, so there is one reader of that
 * endpoint here) and the registry's `dist-tags.latest`. Four states, each named in the
 * `--out` file as `state=`:
 *
 *   in-sync       the server and the registry agree; nothing to do
 *   awaiting-tag  main already carries the server's version; the tag is the missing step
 *   drift         the server is ahead of the registry and main does not carry it yet
 *   behind        the server is BEHIND the registry — a rollback, or a premature publish.
 *                 Exit 1. Nothing here proposes a downgrade; a person decides.
 *
 * `--prepare` acts only on `drift`, in the tree this script lives in, and touches six
 * files: package.json and package-lock.json (`npm version`), catalogue.json (the probe's
 * `--write`), API.md (regenerated) and CHANGELOG.md (a `## [X.Y.Z]` block below
 * `[Unreleased]`, carrying what was waiting there). It then runs the offline gates and
 * records their result rather than aborting on it: a failing gate is information the
 * pull request must carry, and the PR is opened as a DRAFT in that case, as it is when
 * the probe reports the surface CHANGED.
 *
 * Exit 0 = decided (in-sync, awaiting-tag, drift, or prepared). 1 = decided, and the
 * decision is not one to act on: `behind`, or `--prepare` asked on a state with nothing
 * to prepare — `state=` in the `--out` file says which. 2 = could not
 * decide — the server, the registry or a file could not be read, or a value read was
 * not the shape it must be. Every version string read from the network is checked
 * against `X.Y.Z` before it is used anywhere, because it ends up in a branch name, a
 * commit, and an `npm version` argument.
 */

import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { nodePath, npmCliPath, runToolAsync } from './tools.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
const REGISTRY = process.env.PROPOSE_REGISTRY_URL ?? 'https://registry.npmjs.org/viafrei';
const TIMEOUT_MS = Number(process.env.PROBE_TIMEOUT_MS ?? 20_000);
const RELEASE_PAGE = 'https://github.com/mavrovde/viafrei-mcp/releases/tag/v';

/** Three dotted integers and nothing else: a prerelease or a tag is not a number this package mirrors. */
const SEMVER = /^(\d{1,4})\.(\d{1,4})\.(\d{1,4})$/u;
const DATE = /^\d{4}-\d{2}-\d{2}$/u;

/** The files `--prepare` may change, and the only ones the workflow stages. */
const FILES = Object.freeze(['package.json', 'package-lock.json', 'catalogue.json', 'API.md', 'README.md', 'CHANGELOG.md']);

/** The offline gates run after preparing. Each is a script beside this one. */
const GATES = Object.freeze([
    { name: 'check:versions', script: 'check-versions.mjs', args: [] },
    { name: 'check:docs', script: 'gen-api-doc.mjs', args: ['--check'] },
    { name: 'check:readme', script: 'gen-readme-catalogue.mjs', args: ['--check'] },
    { name: 'check:sources', script: 'check-sources.mjs', args: [] }
]);

const WRAP_AT = 88;

/** What a DATED re-capture moved, in one place: the lead and the pull-request body both say it. */
const DATED_MOVED = Object.freeze({
    withDate: 'only the version string and the capture date moved',
    sameDay: 'only the version string moved; the capture date is the same day'
});

/**
 * Nothing read from the network or from a child process reaches a log line carrying a
 * line break or a control character. A forged line in a workflow log is the attack
 * (Sonar S5145), and `version()` already refuses anything but digits and dots — this is
 * the same promise made visible on the one path a validator does not cover, the text
 * of a refusal that quotes what it read. What it does not strip, named: the C1 controls
 * and Unicode's own line and paragraph separators, which neither a shell nor an Actions
 * log treats as a line break.
 */
function oneLine(text) {
    return String(text).replace(/[\u0000-\u001f\u007f]+/gu, ' ').trim();
}

function refuse(message) {
    console.error(`propose-release: CANNOT DECIDE - ${oneLine(message)}`);
    console.error('propose-release: this is a failure, not a pass: a run that read nothing has decided nothing');
    process.exit(2);
}

function parseArguments(argv) {
    const options = { prepare: false, out: null, body: null, date: null };
    for (let i = 0; i < argv.length; i += 1) {
        const arg = argv[i];
        if (arg === '--prepare') {
            options.prepare = true;
        } else if (arg === '--out' || arg === '--body' || arg === '--date') {
            const value = argv[i + 1];
            if (value === undefined || value.startsWith('--')) refuse(`${arg} needs a value`);
            options[arg.slice(2)] = value;
            i += 1;
        } else {
            refuse(`unknown option ${arg}. Usage: propose-release.mjs [--prepare] [--out <file>] [--body <file>] [--date YYYY-MM-DD]`);
        }
    }
    if (options.date !== null && !DATE.test(options.date)) refuse(`--date must be YYYY-MM-DD, not ${JSON.stringify(options.date)}`);
    return options;
}

/**
 * A version string that may be used in a branch name, a commit and an npm argument.
 * What is RETURNED is rebuilt from the three digit groups the pattern captured, never
 * the string that was read: the validator is then also the sanitiser, and nothing from
 * the network reaches a branch name or a log line except digits and dots.
 */
function version(label, raw) {
    const match = typeof raw === 'string' ? SEMVER.exec(raw) : null;
    if (match === null) {
        refuse(`${label} is ${JSON.stringify(typeof raw === 'string' ? oneLine(raw) : raw)}, not a release version of the form X.Y.Z — a prerelease, a tag or a missing field is not a number this package mirrors`);
    }
    return `${match[1]}.${match[2]}.${match[3]}`;
}

function compare(a, b) {
    const left = SEMVER.exec(a).slice(1).map(Number);
    const right = SEMVER.exec(b).slice(1).map(Number);
    for (let i = 0; i < 3; i += 1) {
        if (left[i] !== right[i]) return left[i] - right[i];
    }
    return 0;
}

function readJson(file) {
    try {
        return JSON.parse(readFileSync(join(ROOT, file), 'utf8'));
    } catch (error) {
        refuse(`cannot read ${file} — ${error.message}`);
    }
    return undefined;
}

/** Run a sibling script, or npm, and report its exit status with both streams. */
async function runChild(file, args, options = {}) {
    try {
        const stdout = await runToolAsync(file, args, { encoding: 'utf8', cwd: ROOT, ...options });
        return { status: 0, stdout, stderr: '' };
    } catch (error) {
        if (typeof error.status !== 'number') refuse(`${args[0] ?? file} could not be started — ${error.message}`);
        return { status: error.status, stdout: error.stdout ?? '', stderr: error.stderr ?? '' };
    }
}

function runScript(name, args = []) {
    return runChild(nodePath(), [join(HERE, name), ...args]);
}

/**
 * The last lines of a child's output, each sanitised. The newlines between them survive
 * only on the pull-request-body path, inside a fenced block; `refuse()` flattens the
 * whole message to one line on purpose, so there they are gone again.
 */
function tail(text, lines = 12) {
    return text.trim().split('\n').slice(-lines).map(oneLine).join('\n');
}

// --- the three readings ---------------------------------------------------------------

/**
 * The server's version, through the catalogue probe — the one reader of that endpoint
 * in this repository. Exit 1 from the probe is expected here (the snapshot on main
 * usually names the published version, not the live one); only exit 2 is a refusal.
 */
async function readServer() {
    const probe = await runScript('probe-catalogue.mjs');
    if (probe.status === 2) refuse(`the catalogue probe could not read the server:\n${tail(probe.stderr)}`);
    const match = /^probe-catalogue: \S+ reports (\S+) — /mu.exec(probe.stdout);
    if (match === null) refuse('the catalogue probe printed no "reports <version>" line, so the live version is unknown');
    return version("the server's serverInfo.version", match[1]);
}

/** `dist-tags.latest`, read past both caches the registry sits behind. */
async function readRegistry() {
    const url = new URL(REGISTRY);
    url.searchParams.set('nocache', `${Date.now()}-${process.pid}`);
    let response;
    try {
        response = await fetch(url, {
            headers: { accept: 'application/vnd.npm.install-v1+json', 'cache-control': 'no-cache' },
            signal: AbortSignal.timeout(TIMEOUT_MS)
        });
    } catch (error) {
        refuse(`the registry could not be read at ${REGISTRY} — ${error.message}`);
    }
    if (!response.ok) refuse(`the registry answered ${response.status} for ${REGISTRY}`);
    let document;
    try {
        document = await response.json();
    } catch (error) {
        refuse(`the registry's answer for ${REGISTRY} is not JSON — ${error.message}`);
    }
    return version("the registry's dist-tags.latest", document?.['dist-tags']?.latest);
}

function readManifest() {
    return version("package.json's version", readJson('package.json').version);
}

function decide(live, npm, manifest) {
    if (live === npm) {
        return { state: 'in-sync', why: `the server and the registry both report ${live} (main carries ${manifest})` };
    }
    if (compare(live, npm) < 0) {
        return {
            state: 'behind',
            why: `the server reports ${live} but the registry's latest is ${npm} — the package is AHEAD of the service it relays to. ` +
                'Nothing here proposes a downgrade; a person decides whether prod rolled back or a publish was premature'
        };
    }
    if (manifest === live) {
        return { state: 'awaiting-tag', why: `main already carries ${live} while the registry's latest is ${npm}: the release is prepared and the tag is the missing step` };
    }
    return { state: 'drift', why: `the server reports ${live}, the registry's latest is ${npm}, main carries ${manifest}` };
}

// --- preparing ------------------------------------------------------------------------

async function bumpManifest(live) {
    const npm = await runChild(nodePath(), [npmCliPath(), 'version', live, '--no-git-tag-version', '--ignore-scripts']);
    if (npm.status !== 0) refuse(`npm version ${live} failed:\n${tail(npm.stderr)}`);
    const after = readJson('package.json').version;
    if (after !== live) refuse(`npm version ${live} ran, but package.json now says ${after}`);
}

/**
 * Re-capture the snapshot and read the probe's own verdict off its report. The report
 * is the probe's contract, not a log: WRONG means the surface moved and a person must
 * describe it, DATED means only the number did. Exit 0 (the snapshot already matched)
 * is treated as DATED, because nothing on the surface moved either way.
 */
async function recapture(live) {
    const capturedBefore = readJson('catalogue.json').capturedAt;
    const probe = await runScript('probe-catalogue.mjs', ['--write']);
    if (probe.status === 2) refuse(`the catalogue probe could not re-capture the server:\n${tail(probe.stderr)}`);
    const wrong = /the snapshot is WRONG about this server/u.test(probe.stderr);
    const differences = [...probe.stderr.matchAll(/^ {2}! (.+)$/gmu)]
        .map(match => match[1])
        .filter(line => !line.startsWith('serverInfo.version:'));
    const after = readJson('catalogue.json');
    if (after.serverInfo?.version !== live) refuse(`the probe rewrote catalogue.json, but its serverInfo.version is ${after.serverInfo?.version}, not ${live}`);
    // Two releases on one day leave the capture date where it was, and with every patch
    // mirrored that is the normal path, not a coincidence: the lead says so only when it is so.
    return { verdict: wrong ? 'wrong' : 'dated', differences, captureMoved: after.capturedAt !== capturedBefore };
}

async function regenerateReference() {
    const docs = await runScript('gen-api-doc.mjs');
    if (docs.status !== 0) refuse(`API.md could not be regenerated:\n${tail(docs.stderr)}`);
    // The README's catalogue section is rendered from the same snapshot and names its
    // version and capture date, so a release that moves either must regenerate it too —
    // the first 1.6.1 proposal did not, and its own check:readme went red.
    //
    // NOT a refusal when it cannot render. The generator refuses a tool it cannot place
    // in a README group, and a server that GAINED a tool is exactly the release this
    // workflow must still propose — as a draft, with check:readme failing and saying
    // which tool needs a group. So the README is left as it was, and the gate below
    // reports the reason; refusing here would hide a surface change behind "cannot decide".
    await runScript('gen-readme-catalogue.mjs');
}

function wrap(text, indent = '') {
    const words = text.split(/\s+/u);
    const lines = [];
    let line = indent;
    for (const word of words) {
        if (line.length > indent.length && line.length + 1 + word.length > WRAP_AT) {
            lines.push(line);
            line = indent;
        }
        line = line.length > indent.length ? `${line} ${word}` : `${indent}${word}`;
    }
    if (line.length > indent.length) lines.push(line);
    return lines;
}

function lead({ live, npm, verdict, differences, captureMoved }) {
    const datedTail = ` — ${captureMoved ? DATED_MOVED.withDate : DATED_MOVED.sameDay}.`;
    const lines = wrap(
        `**Mirrors the server.** The bridge is versioned to match the ViaFrei MCP server it relays to. ` +
        `The running server reports ${live} while the registry's latest is ${npm}, so this release moves the ` +
        `package to the server's number and carries whatever had been waiting under \`[Unreleased]\`. Prepared by ` +
        `the \`Version sync\` workflow: the shipped reference was re-captured from the running server, and the ` +
        `probe reported the surface ${verdict === 'wrong' ? '**CHANGED**' : '**unchanged**'}` +
        (verdict === 'wrong' ? ' — the automation knows what moved, not what it means:' : datedTail)
    );
    if (verdict === 'wrong') {
        lines.push(
            '',
            ...differences.flatMap(difference => wrap(`- ${difference}`)),
            '',
            ...wrap(
                '**A person must describe the change above before this merges.** A release note that lists a ' +
                'tool name without saying what it does misleads the reader it exists for.'
            )
        );
    }
    return lines;
}

/**
 * Move `[Unreleased]`'s content under a new `## [X.Y.Z] - date` block and add the link
 * reference. The file's shape is asserted before anything is placed, and a block for
 * this version already present is a refusal: a release is prepared once.
 */
function cutChangelog(reading, date) {
    const path = join(ROOT, 'CHANGELOG.md');
    let text;
    try {
        text = readFileSync(path, 'utf8');
    } catch (error) {
        refuse(`cannot read CHANGELOG.md — ${error.message}`);
    }
    const lines = text.split('\n');
    const headings = lines.flatMap((line, index) => (line.startsWith('## [') ? [index] : []));
    if (headings.length < 2 || lines[headings[0]] !== '## [Unreleased]') {
        refuse('CHANGELOG.md does not open its history with "## [Unreleased]" followed by a version block, so a new block cannot be placed');
    }
    if (lines.some(line => line.startsWith(`## [${reading.live}]`))) {
        refuse(`CHANGELOG.md already carries a block for ${reading.live} — a release is prepared once, and nothing here writes it twice`);
    }
    const firstReference = lines.findIndex(line => /^\[\d+\.\d+\.\d+\]: /u.test(line));
    if (firstReference === -1) refuse('CHANGELOG.md carries no version link references, so there is nowhere to add one');

    const waiting = lines.slice(headings[0] + 1, headings[1]);
    while (waiting.length > 0 && waiting[0].trim() === '') waiting.shift();
    while (waiting.length > 0 && waiting.at(-1).trim() === '') waiting.pop();

    const block = ['## [Unreleased]', '', `## [${reading.live}] - ${date}`, '', ...lead(reading), ''];
    if (waiting.length > 0) block.push(...waiting, '');

    const next = [
        ...lines.slice(0, headings[0]),
        ...block,
        ...lines.slice(headings[1], firstReference),
        `[${reading.live}]: ${RELEASE_PAGE}${reading.live}`,
        ...lines.slice(firstReference)
    ];
    writeFileSync(path, next.join('\n'));
    return waiting.length;
}

/** The three gates only read the prepared tree, so they run at once. */
function runGates() {
    return Promise.all(GATES.map(async gate => {
        const run = await runScript(gate.script, gate.args);
        return { name: gate.name, status: run.status, output: tail(`${run.stdout}\n${run.stderr}`, 20) };
    }));
}

function gateVerdict(gate) {
    return gate.status === 0 ? 'PASS' : `**FAIL** (exit ${gate.status})`;
}

function pullRequestBody(reading, date, gates, waitingLines) {
    const failed = gates.filter(gate => gate.status !== 0);
    const surfaceTail = reading.captureMoved ? DATED_MOVED.withDate : DATED_MOVED.sameDay;
    const surface = reading.verdict === 'wrong'
        ? `**CHANGED** — ${reading.differences.length} difference(s), listed below`
        : `**unchanged** — ${surfaceTail}`;
    const out = [
        `Prepared by the **Version sync** workflow. The running server reports **${reading.live}**, the registry's ` +
        `\`latest\` is **${reading.npm}**, and \`main\` carried ${reading.manifest}.`,
        '',
        '## What the automation did',
        '',
        '| step | result |',
        '|---|---|',
        `| \`npm version ${reading.live}\` | \`package.json\` and both lockfile fields |`,
        `| \`probe-catalogue --write\` | re-captured from the running server; surface ${surface} |`,
        '| `docs:api` | `API.md` regenerated from the new snapshot |',
        '| `docs:readme` | the README\'s catalogue section regenerated from the same snapshot |',
        `| CHANGELOG | \`## [${reading.live}] - ${date}\` written below \`[Unreleased]\`, carrying the ${waitingLines} line(s) that were waiting there; link reference added |`,
        '',
        '## Gates run on the prepared tree',
        '',
        '| gate | result |',
        '|---|---|',
        ...gates.map(gate => `| \`${gate.name}\` | ${gateVerdict(gate)} |`),
        ''
    ];
    for (const gate of failed) {
        out.push(`<details><summary>\`${gate.name}\` output</summary>`, '', '```', gate.output, '```', '', '</details>', '');
    }
    if (reading.verdict === 'wrong') {
        out.push(
            '## The surface changed — describe it before merging',
            '',
            'The probe reported the snapshot **WRONG**, not merely dated. The CHANGELOG block lists what moved; it ' +
            'cannot say what the change means, and the sources page may need the same attention — a new fuel tool ' +
            'is a licence matter, not a count.',
            '',
            ...reading.differences.map(difference => `- ${difference}`),
            ''
        );
    }
    const pure = failed.length === 0 && reading.verdict !== 'wrong';
    const byHand = [
        '1. review, then the one post-mortem comment (`APPROVE` / `HEAD: <sha>` / `BASE: main`);',
        '2. merge — a merge commit, never a squash;',
        `3. \`git tag v${reading.live} <merge sha>\` and push the tag alone. \`publish.yml\` does the rest.`
    ];
    if (pure) {
        out.push(
            '## What happens next: the automatic path',
            '',
            'This is a pure mirror — the surface is unchanged and every gate passed — so, unless the leak sweep ' +
            'below says otherwise, the Version sync workflow finishes the release itself: it waits for this pull ' +
            `request's required checks (CI and SonarCloud, at most 30 minutes), merges it with a merge commit, tags ` +
            `\`v${reading.live}\` on the merge commit, and dispatches npm, then Smithery and the release page.`,
            '',
            'If a check is red, or still pending at the deadline, it merges nothing and stops red; this pull request ' +
            'then waits for a person, who finishes it by hand:',
            '',
            ...byHand
        );
    } else {
        out.push(
            '## What it did not do, and will not',
            '',
            'It opened this pull request and nothing else. The verdict, the merge and the tag are a person\'s:',
            '',
            ...byHand
        );
    }
    out.push(
        '',
        `Opened as a ${pure ? 'ready pull request: every gate passed and the surface is unchanged' : '**draft**, because a gate failed or the surface changed'}.`
    );
    return `${out.join('\n')}\n`;
}

function writeOut(file, entries) {
    if (file === null) return;
    const text = Object.entries(entries).map(([key, value]) => `${key}=${value}`).join('\n');
    writeFileSync(file, `${text}\n`);
}

function digest(files) {
    return files.map(file => {
        try {
            return createHash('sha256').update(readFileSync(join(ROOT, file))).digest('hex');
        } catch {
            return 'absent';
        }
    }).join(',');
}

// --- main -----------------------------------------------------------------------------

const options = parseArguments(process.argv.slice(2));
// Detect must write nothing, and that is asserted rather than trusted: the six files
// prepare may touch are hashed before the reads and compared after them.
const before = options.prepare ? null : digest(FILES);

const live = await readServer();
const npm = await readRegistry();
const manifest = readManifest();
const decision = decide(live, npm, manifest);

// `oneLine` again on values `version()` already rebuilt from digits: a no-op in effect, and
// the construction a taint analyser recognises where it may not recognise the regex.
console.log(oneLine(`propose-release: server ${live}, registry ${npm}, main ${manifest} → ${decision.state}`));
console.log(`  ${oneLine(decision.why)}`);

if (!options.prepare) {
    if (digest(FILES) !== before) refuse('detect changed a file in the tree, and detect must write nothing');
    writeOut(options.out, { state: decision.state, version: live, npm, manifest });
    process.exit(decision.state === 'behind' ? 1 : 0);
}

if (decision.state !== 'drift') {
    console.error(`propose-release: nothing to prepare — ${oneLine(decision.why)}`);
    writeOut(options.out, { state: decision.state, version: live, npm, manifest });
    process.exit(1);
}

const date = options.date ?? new Date().toISOString().slice(0, 10);
await bumpManifest(live);
const { verdict, differences, captureMoved } = await recapture(live);
await regenerateReference();
const reading = { live, npm, manifest, verdict, differences, captureMoved };
const waitingLines = cutChangelog(reading, date);
const gates = await runGates();
const gatesPass = gates.every(gate => gate.status === 0);
const draft = !gatesPass || verdict === 'wrong';

for (const gate of gates) console.log(`  ${gate.status === 0 ? 'PASS' : 'FAIL'}  ${gate.name}`);
console.log(`propose-release: PREPARED ${live} — surface ${verdict}, gates ${gatesPass ? 'pass' : 'FAIL'}, ${draft ? 'draft' : 'ready'}`);

if (options.body !== null) writeFileSync(options.body, pullRequestBody(reading, date, gates, waitingLines));
writeOut(options.out, {
    state: 'proposed',
    version: live,
    npm,
    manifest,
    verdict,
    gates: gatesPass ? 'pass' : 'fail',
    draft: String(draft),
    files: FILES.join(',')
});

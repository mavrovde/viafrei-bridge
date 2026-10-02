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
 * WHAT IT WILL NOT DO, and this is the design rather than a limit: it does not merge,
 * tag or publish. Three reasons, each sufficient on its own. The merge needs a reviewer
 * verdict covering HEAD, which a bot merging through the API would simply bypass. An npm
 * version is immutable, so a wrong one can never be reissued under that number. And when
 * the server's SURFACE changed — not just its number — the release note needs a sentence
 * about what the change means, which nothing here can write: the 1.4.9 cut carried a
 * licence-relevant fix for exactly that case (a second fuel tool the sources page had not
 * named). So the output is a branch and a pull request, and the three remaining acts are
 * a person's: the verdict, the merge, the tag. The tag then publishes, as it always has.
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
 * `--prepare` acts only on `drift`, in the tree this script lives in, and touches five
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
const RELEASE_PAGE = 'https://github.com/mavrovde/viafrei-bridge/releases/tag/v';

/** Three dotted integers and nothing else: a prerelease or a tag is not a number this package mirrors. */
const SEMVER = /^(\d{1,4})\.(\d{1,4})\.(\d{1,4})$/u;
const DATE = /^\d{4}-\d{2}-\d{2}$/u;

/** The files `--prepare` may change, and the only ones the workflow stages. */
const FILES = Object.freeze(['package.json', 'package-lock.json', 'catalogue.json', 'API.md', 'CHANGELOG.md']);

/** The offline gates run after preparing. Each is a script beside this one. */
const GATES = Object.freeze([
    { name: 'check:versions', script: 'check-versions.mjs', args: [] },
    { name: 'check:docs', script: 'gen-api-doc.mjs', args: ['--check'] },
    { name: 'check:sources', script: 'check-sources.mjs', args: [] }
]);

const WRAP_AT = 88;

function refuse(message) {
    console.error(`propose-release: CANNOT DECIDE - ${message}`);
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

/** A version string that may be used in a branch name, a commit and an npm argument. */
function version(label, raw) {
    if (typeof raw !== 'string' || !SEMVER.test(raw)) {
        refuse(`${label} is ${JSON.stringify(raw)}, not a release version of the form X.Y.Z — a prerelease, a tag or a missing field is not a number this package mirrors`);
    }
    return raw;
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

function tail(text, lines = 12) {
    return text.trim().split('\n').slice(-lines).join('\n');
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
    const probe = await runScript('probe-catalogue.mjs', ['--write']);
    if (probe.status === 2) refuse(`the catalogue probe could not re-capture the server:\n${tail(probe.stderr)}`);
    const wrong = /the snapshot is WRONG about this server/u.test(probe.stderr);
    const differences = [...probe.stderr.matchAll(/^ {2}! (.+)$/gmu)]
        .map(match => match[1])
        .filter(line => !line.startsWith('serverInfo.version:'));
    const captured = readJson('catalogue.json').serverInfo?.version;
    if (captured !== live) refuse(`the probe rewrote catalogue.json, but its serverInfo.version is ${captured}, not ${live}`);
    return { verdict: wrong ? 'wrong' : 'dated', differences };
}

async function regenerateReference() {
    const docs = await runScript('gen-api-doc.mjs');
    if (docs.status !== 0) refuse(`API.md could not be regenerated:\n${tail(docs.stderr)}`);
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

function lead({ live, npm, verdict, differences }) {
    const lines = wrap(
        `**Mirrors the server.** The bridge is versioned to match the ViaFrei MCP server it relays to. ` +
        `The running server reports ${live} while the registry's latest is ${npm}, so this release moves the ` +
        `package to the server's number and carries whatever had been waiting under \`[Unreleased]\`. Prepared by ` +
        `the \`Version sync\` workflow: the shipped reference was re-captured from the running server, and the ` +
        `probe reported the surface ${verdict === 'wrong' ? '**CHANGED**' : '**unchanged**'}` +
        (verdict === 'wrong'
            ? ' — the automation knows what moved, not what it means:'
            : ' — only the version string and the capture date moved.')
    );
    if (verdict === 'wrong') {
        lines.push('');
        for (const difference of differences) lines.push(...wrap(`- ${difference}`));
        lines.push('');
        lines.push(...wrap(
            '**A person must describe the change above before this merges.** A release note that lists a ' +
            'tool name without saying what it does misleads the reader it exists for.'
        ));
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

async function runGates() {
    const results = [];
    for (const gate of GATES) {
        const run = await runScript(gate.script, gate.args);
        results.push({ name: gate.name, status: run.status, output: tail(`${run.stdout}\n${run.stderr}`, 20) });
    }
    return results;
}

function gateVerdict(gate) {
    return gate.status === 0 ? 'PASS' : `**FAIL** (exit ${gate.status})`;
}

function pullRequestBody(reading, date, gates, waitingLines) {
    const failed = gates.filter(gate => gate.status !== 0);
    const surface = reading.verdict === 'wrong'
        ? `**CHANGED** — ${reading.differences.length} difference(s), listed below`
        : '**unchanged** — only the version string and the capture date moved';
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
    out.push(
        '## What it did not do, and will not',
        '',
        'It opened this pull request and nothing else. The verdict, the merge and the tag are a person\'s:',
        '',
        '1. review, then the one post-mortem comment (`APPROVE` / `HEAD: <sha>` / `BASE: main`);',
        '2. merge — a merge commit, never a squash;',
        `3. \`git tag v${reading.live} <merge sha>\` and push the tag alone. \`publish.yml\` does the rest.`,
        '',
        `Opened as a ${failed.length > 0 || reading.verdict === 'wrong' ? '**draft**, because a gate failed or the surface changed' : 'ready pull request: every gate passed and the surface is unchanged'}.`
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
// Detect must write nothing, and that is asserted rather than trusted: the five files
// prepare may touch are hashed before the reads and compared after them.
const before = options.prepare ? null : digest(FILES);

const live = await readServer();
const npm = await readRegistry();
const manifest = readManifest();
const decision = decide(live, npm, manifest);

console.log(`propose-release: server ${live}, registry ${npm}, main ${manifest} → ${decision.state}`);
console.log(`  ${decision.why}`);

if (!options.prepare) {
    if (digest(FILES) !== before) refuse('detect changed a file in the tree, and detect must write nothing');
    writeOut(options.out, { state: decision.state, version: live, npm, manifest });
    process.exit(decision.state === 'behind' ? 1 : 0);
}

if (decision.state !== 'drift') {
    console.error(`propose-release: nothing to prepare — ${decision.why}`);
    writeOut(options.out, { state: decision.state, version: live, npm, manifest });
    process.exit(1);
}

const date = options.date ?? new Date().toISOString().slice(0, 10);
await bumpManifest(live);
const { verdict, differences } = await recapture(live);
await regenerateReference();
const reading = { live, npm, manifest, verdict, differences };
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

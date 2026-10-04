#!/usr/bin/env node
/**
 * The decisions behind the Version sync workflow's AUTOMATIC path, in one place a
 * self-test can reach: may this proposal be merged without a person, are its required
 * checks green, did a dispatched run conclude success.
 *
 * WHAT THE AUTOMATIC PATH IS (owner decision, 2026-10-04). A release that only MIRRORS
 * the server — the probe found the surface unchanged, every offline gate passed, the
 * leak sweep found nothing — carries no sentence a person has to write. For that one
 * case the workflow opens the pull request as before, waits for its required checks
 * (CI and SonarCloud) with a deadline, merges it with a merge commit, tags the merge
 * commit and dispatches the npm, Smithery and release-page workflows. Anything else is
 * a draft or a ready pull request for a person, exactly as before, and anything that
 * is not green on the automatic path stops it with the reason and leaves the pull
 * request open. Nothing here merges on red, on pending, or on a read that failed.
 *
 *   node scripts/auto-release.mjs decide --prepare-env <file> --leaks <outcome>
 *   node scripts/auto-release.mjs wait-checks --sha <sha> --required <a,b,c> [--deadline-s N] [--interval-s N]
 *   node scripts/auto-release.mjs wait-run --workflow <file.yml> --ref <ref> --since <iso> [--deadline-s N] [--interval-s N]
 *
 * `decide` prints `auto=true|false` and `reason=…` lines for $GITHUB_OUTPUT and exits
 * 0 (it decided either way) or 2 (the prepare file could not be read).
 * `wait-checks` and `wait-run` read the GitHub REST API with GH_TOKEN at GITHUB_API_URL
 * for GITHUB_REPOSITORY, all three as Actions sets them (none is defaulted), and exit 0 = concluded success,
 * 1 = concluded otherwise or the deadline passed, 2 = could not run at all.
 *
 * THE RULE BOTH WAITS SHARE: a read that failed is "not known yet", never success.
 * Only an answer that names every required check as completed with conclusion
 * `success` (or a run as completed `success`) ends a wait green; a failed read keeps
 * polling and, at the deadline, is reported as unreadable.
 */

import { readFileSync } from 'node:fs';

/** Completed check conclusions. Only `success` is green here, deliberately stricter than GitHub's. */
const GREEN = 'success';

function oneLine(text) {
    return String(text).replace(/[\u0000-\u001f\u007f]+/gu, ' ').trim();
}

// --- decide -----------------------------------------------------------------------------

/**
 * May the proposal be released without a person? Every condition is named, so the
 * workflow log says WHICH one sent the release to a person.
 *
 * @param {{state?: string, verdict?: string, gates?: string, draft?: string, leaks?: string}} p
 * @returns {{auto: boolean, reason: string}}
 */
export function decideAutoPath(p) {
    const reasons = [];
    if (p.state !== 'proposed') reasons.push(`nothing was prepared (state ${p.state ?? 'absent'})`);
    if (p.verdict !== 'dated') reasons.push(`the surface is not unchanged (verdict ${p.verdict ?? 'absent'}) — a person must describe it`);
    if (p.gates !== 'pass') reasons.push(`an offline gate did not pass (gates ${p.gates ?? 'absent'})`);
    if (p.draft !== 'false') reasons.push(`the proposer marked it a draft (draft ${p.draft ?? 'absent'})`);
    if (p.leaks !== 'success') reasons.push(`the leak sweep did not succeed (outcome ${p.leaks ?? 'absent'})`);
    if (reasons.length > 0) return { auto: false, reason: reasons.join('; ') };
    return { auto: true, reason: 'a pure mirror: surface unchanged, every gate passed, the leak sweep is clean' };
}

/** `key=value` lines, as the proposer's --out file carries them. */
export function parseEnvFile(text) {
    const out = {};
    for (const line of text.split('\n')) {
        const at = line.indexOf('=');
        if (at > 0) out[line.slice(0, at)] = line.slice(at + 1);
    }
    return out;
}

// --- judging ----------------------------------------------------------------------------

/**
 * The required checks on one commit, judged from the check-runs and the commit
 * statuses GitHub returned. The NEWEST entry per name counts (a re-run replaces its
 * predecessor). A required name with no entry at all is pending, not green: a check
 * that has not reported yet has not passed.
 *
 * @param {string[]} required
 * @param {{name: string, id: number, status: string, conclusion: string|null}[]} checkRuns
 * @param {{context: string, id: number, state: string}[]} statuses
 * @returns {{state: 'success'|'failure'|'pending', detail: string}}
 */
export function judgeChecks(required, checkRuns, statuses) {
    if (!Array.isArray(required) || required.length === 0) {
        throw new Error('no required checks were named, and "all of nothing is green" is not a verdict');
    }
    const failed = [];
    const pending = [];
    for (const name of required) {
        const runs = (checkRuns ?? []).filter(run => run.name === name).sort((a, b) => b.id - a.id);
        const marks = (statuses ?? []).filter(status => status.context === name).sort((a, b) => b.id - a.id);
        if (runs.length > 0) {
            const run = runs[0];
            if (run.status !== 'completed') pending.push(`${name} (${run.status})`);
            else if (run.conclusion !== GREEN) failed.push(`${name} concluded ${run.conclusion}`);
        } else if (marks.length > 0) {
            const mark = marks[0];
            if (mark.state === 'pending') pending.push(`${name} (pending)`);
            else if (mark.state !== GREEN) failed.push(`${name} is ${mark.state}`);
        } else {
            pending.push(`${name} (not reported yet)`);
        }
    }
    if (failed.length > 0) return { state: 'failure', detail: failed.join('; ') };
    if (pending.length > 0) return { state: 'pending', detail: `waiting for ${pending.join(', ')}` };
    return { state: 'success', detail: `all ${required.length} required checks concluded success` };
}

/**
 * The run a dispatch started, judged from the workflow's run list. Only runs created
 * at or after `since` count (minus a minute's clock allowance), so an older run on the
 * same ref cannot answer for this dispatch; the newest of them is the one.
 *
 * @param {{id: number, status: string, conclusion: string|null, created_at: string, html_url?: string}[]} runs
 * @param {string} since ISO instant taken before the dispatch
 * @returns {{state: 'success'|'failure'|'pending', detail: string}}
 */
export function judgeRun(runs, since) {
    const floor = Date.parse(since) - 60_000;
    if (Number.isNaN(floor)) throw new Error(`--since ${JSON.stringify(since)} is not an instant`);
    const mine = (runs ?? []).filter(run => Date.parse(run.created_at) >= floor).sort((a, b) => b.id - a.id);
    if (mine.length === 0) return { state: 'pending', detail: 'the dispatched run has not appeared yet' };
    const run = mine[0];
    const where = run.html_url ? ` (${run.html_url})` : ` (run ${run.id})`;
    if (run.status !== 'completed') return { state: 'pending', detail: `run is ${run.status}${where}` };
    if (run.conclusion !== GREEN) return { state: 'failure', detail: `run concluded ${run.conclusion}${where}` };
    return { state: 'success', detail: `run concluded success${where}` };
}

/**
 * Poll `read` until `judge` says success or failure, or the deadline passes. A read
 * that throws is recorded and polled again; it is never a verdict. The deadline is
 * counted in intervals waited, so the test drives it without a clock.
 *
 * @returns {Promise<{state: 'success'|'failure'|'timeout', detail: string, reads: number}>}
 */
export async function waitFor({ read, judge, deadlineMs, intervalMs, sleep, log = () => {} }) {
    let reads = 0;
    let last = 'no read yet';
    for (let waited = 0; ; waited += intervalMs) {
        reads += 1;
        let verdict;
        try {
            verdict = judge(await read());
        } catch (error) {
            verdict = { state: 'unreadable', detail: `the read failed — ${oneLine(error.message)}` };
        }
        last = verdict.detail;
        log(`read ${reads}: ${verdict.state} — ${last}`);
        if (verdict.state === 'success' || verdict.state === 'failure') return { state: verdict.state, detail: last, reads };
        if (waited + intervalMs > deadlineMs) {
            return { state: 'timeout', detail: `not concluded within ${Math.round(deadlineMs / 1000)} s (${reads} reads); last: ${last}`, reads };
        }
        await sleep(intervalMs);
    }
}

// --- the GitHub reads -------------------------------------------------------------------

function api() {
    const base = process.env.GITHUB_API_URL ?? '';
    const repo = process.env.GITHUB_REPOSITORY ?? '';
    const token = process.env.GH_TOKEN ?? '';
    if (!/^https?:\/\/\S+$/u.test(base)) throw new Error('GITHUB_API_URL is not set (Actions sets it on every runner)');
    if (!/^[\w.-]+\/[\w.-]+$/u.test(repo)) throw new Error('GITHUB_REPOSITORY is not owner/name');
    if (token === '') throw new Error('GH_TOKEN is empty');
    return async path => {
        const response = await fetch(`${base}/repos/${repo}${path}`, {
            headers: { authorization: `Bearer ${token}`, accept: 'application/vnd.github+json', 'x-github-api-version': '2022-11-28' },
            signal: AbortSignal.timeout(20_000)
        });
        if (response.status !== 200) throw new Error(`GET ${path.split('?')[0]} answered HTTP ${response.status}`);
        return response.json();
    };
}

function parseFlags(argv, allowed) {
    const flags = {};
    for (let i = 0; i < argv.length; i += 2) {
        const key = argv[i]?.replace(/^--/u, '');
        if (!allowed.includes(key) || argv[i + 1] === undefined) return null;
        flags[key] = argv[i + 1];
    }
    return flags;
}

function usage(message) {
    console.error(`auto-release: ${message}`);
    process.exit(2);
}

function seconds(value, fallback) {
    if (value === undefined) return fallback * 1000;
    const n = Number(value);
    if (!Number.isInteger(n) || n < 1) usage(`a duration must be a positive whole number of seconds, not ${JSON.stringify(value)}`);
    return n * 1000;
}

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

async function finish(label, result) {
    if (result.state === 'success') {
        console.log(`auto-release: ${label}: ${result.detail}`);
        process.exit(0);
    }
    console.error(`auto-release: ${label}: NOT GREEN (${result.state}) — ${result.detail}`);
    console.error('auto-release: the automatic path stops here; the pull request is left for a person');
    process.exit(1);
}

async function main(argv) {
    const [command, ...rest] = argv;
    if (command === 'decide') {
        const flags = parseFlags(rest, ['prepare-env', 'leaks']);
        if (flags === null || !flags['prepare-env'] || !flags.leaks) usage('usage: decide --prepare-env <file> --leaks <outcome>');
        let env;
        try {
            env = parseEnvFile(readFileSync(flags['prepare-env'], 'utf8'));
        } catch (error) {
            usage(`cannot read ${flags['prepare-env']} — ${oneLine(error.message)}`);
        }
        const decision = decideAutoPath({ ...env, leaks: flags.leaks });
        console.log(`auto=${decision.auto}`);
        console.log(`reason=${oneLine(decision.reason)}`);
        process.exit(0);
    }
    if (command === 'wait-checks') {
        const flags = parseFlags(rest, ['sha', 'required', 'deadline-s', 'interval-s']);
        if (flags === null || !/^[0-9a-f]{40}$/u.test(flags.sha ?? '')) usage('usage: wait-checks --sha <40-hex sha> --required <a,b,c> [--deadline-s N] [--interval-s N]');
        const required = (flags.required ?? '').split(',').map(name => name.trim()).filter(Boolean);
        if (required.length === 0) usage('--required names no check, and "all of nothing is green" is not a verdict');
        let get;
        try {
            get = api();
        } catch (error) {
            usage(oneLine(error.message));
        }
        const read = async () => {
            const runs = await get(`/commits/${flags.sha}/check-runs?per_page=100`);
            const status = await get(`/commits/${flags.sha}/status?per_page=100`);
            return { checkRuns: runs.check_runs, statuses: status.statuses };
        };
        const result = await waitFor({
            read,
            judge: ({ checkRuns, statuses }) => judgeChecks(required, checkRuns, statuses),
            deadlineMs: seconds(flags['deadline-s'], 30 * 60),
            intervalMs: seconds(flags['interval-s'], 20),
            sleep,
            log: line => console.log(`  ${line}`)
        });
        return finish(`required checks on ${flags.sha}`, result);
    }
    if (command === 'wait-run') {
        const flags = parseFlags(rest, ['workflow', 'ref', 'since', 'deadline-s', 'interval-s']);
        if (flags === null || !/^[\w.-]+\.ya?ml$/u.test(flags.workflow ?? '') || !/^[\w./-]+$/u.test(flags.ref ?? '') || !flags.since) {
            usage('usage: wait-run --workflow <file.yml> --ref <ref> --since <iso> [--deadline-s N] [--interval-s N]');
        }
        if (Number.isNaN(Date.parse(flags.since))) usage(`--since ${JSON.stringify(flags.since)} is not an instant`);
        let get;
        try {
            get = api();
        } catch (error) {
            usage(oneLine(error.message));
        }
        const path = `/actions/workflows/${flags.workflow}/runs?event=workflow_dispatch&branch=${encodeURIComponent(flags.ref)}&per_page=20`;
        const result = await waitFor({
            read: async () => (await get(path)).workflow_runs,
            judge: runs => judgeRun(runs, flags.since),
            deadlineMs: seconds(flags['deadline-s'], 20 * 60),
            intervalMs: seconds(flags['interval-s'], 15),
            sleep,
            log: line => console.log(`  ${line}`)
        });
        return finish(`${flags.workflow} on ${flags.ref}`, result);
    }
    return usage('usage: auto-release.mjs decide|wait-checks|wait-run …');
}

if (import.meta.url === `file://${process.argv[1]}`) {
    await main(process.argv.slice(2));
}

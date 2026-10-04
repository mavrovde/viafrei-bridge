#!/usr/bin/env node
/**
 * The decisions behind the Version sync workflow's AUTOMATIC path, in one place a
 * self-test can reach: may this proposal be merged without a person, are its required
 * checks green, did a dispatched run conclude success, and is a release stuck halfway.
 *
 * WHAT THE AUTOMATIC PATH IS (owner decision, 2026-10-04). A release that only MIRRORS
 * the server — the probe found the surface unchanged, every offline gate passed, the
 * leak sweep found nothing — carries no sentence a person has to write. For that one
 * case the workflow opens the pull request as before, waits for its required checks
 * (CI and SonarCloud) with a deadline, merges it with a merge commit, tags the merge
 * commit and dispatches the npm, Smithery and release-page workflows. Anything else is
 * a draft or a ready pull request for a person, exactly as before. Nothing here merges
 * on red, on pending, or on a read that failed.
 *
 *   node scripts/auto-release.mjs decide --prepare-env <file> --leaks <outcome>
 *   node scripts/auto-release.mjs wait-checks --sha <sha> --required <name@app,…> [--deadline-s N] [--interval-s N]
 *   node scripts/auto-release.mjs wait-run --workflow <file.yml> --sha <sha> --since <iso> [--deadline-s N] [--interval-s N]
 *   node scripts/auto-release.mjs stuck --version X.Y.Z --tag-exists true|false --merged-by <login or ''>
 *
 * `decide` prints `auto=true|false` and `reason=…` lines for $GITHUB_OUTPUT and exits
 * 0 (it decided either way) or 2 (the prepare file could not be read).
 * `wait-checks` and `wait-run` read the GitHub REST API with GH_TOKEN at GITHUB_API_URL
 * for GITHUB_REPOSITORY, all three as Actions sets them (none is defaulted), and exit
 * 0 = concluded success, 1 = concluded otherwise or the deadline passed, 2 = could not
 * run at all. Their failure message says what has ALREADY happened at that stage and
 * what a person does next, because "left for a person" is only true before the merge.
 * `stuck` judges an `awaiting-tag` reading (main carries the server's version, npm does
 * not): exit 1 with the remedy when the automatic path stopped halfway, 0 otherwise.
 *
 * THE RULE BOTH WAITS SHARE: a read that failed is "not known yet", never success.
 * Only an answer that names every required check as completed with conclusion
 * `success` (or the dispatched run as completed `success`) ends a wait green; a failed
 * read keeps polling and, at the deadline, is reported as unreadable.
 */

import { readFileSync } from 'node:fs';

/** Completed check conclusions. Only `success` is green here, deliberately stricter than GitHub's. */
const GREEN = 'success';
const SHA = /^[0-9a-f]{40}$/u;
const VERSION = /^\d+\.\d+\.\d+$/u;

/** The logins GitHub has been seen to give the workflow token's actor. Which one `mergedBy` carries is unmeasured. */
const BOT_LOGINS = Object.freeze(['github-actions', 'github-actions[bot]', 'app/github-actions']);

function oneLine(text) {
    return String(text).replace(/[\u0000-\u001f\u007f]+/gu, ' ').trim();
}

// --- decide -----------------------------------------------------------------------------

/**
 * May the proposal be released without a person? Every condition is named, so the
 * workflow log says WHICH one sent the release to a person. `verdict` must be exactly
 * `dated`: `wrong` and the proposer's `unclassified` both go to a person.
 *
 * @param {{state?: string, verdict?: string, gates?: string, draft?: string, leaks?: string}} p
 * @returns {{auto: boolean, reason: string}}
 */
export function decideAutoPath(p) {
    const reasons = [];
    if (p.state !== 'proposed') reasons.push(`nothing was prepared (state ${p.state ?? 'absent'})`);
    if (p.verdict !== 'dated') reasons.push(`the surface is not known to be unchanged (verdict ${p.verdict ?? 'absent'}) — a person must look`);
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
 * `name@app-slug,…` → [{name, app}]. The app is REQUIRED: a check is identified by its
 * name and the app that reports it, as branch protection identifies it, so another
 * workflow or app reporting the same name cannot satisfy it. Commit statuses carry no
 * app and are therefore never counted.
 */
export function parseRequired(text) {
    const entries = String(text ?? '').split(',').map(item => item.trim()).filter(Boolean).map(item => {
        const at = item.lastIndexOf('@');
        return at > 0 ? { name: item.slice(0, at).trim(), app: item.slice(at + 1).trim() } : { name: item, app: '' };
    });
    const bad = entries.filter(entry => entry.name === '' || entry.app === '');
    if (bad.length > 0) throw new Error(`every required check must be written name@app-slug, and ${bad.map(entry => entry.name || '(empty)').join(', ')} is not`);
    if (entries.length === 0) throw new Error('no required checks were named, and "all of nothing is green" is not a verdict');
    return entries;
}

/**
 * The required checks on one commit, judged from the check-runs GitHub returned. A run
 * counts only when BOTH its name and its app's slug match; the NEWEST such run per check
 * counts (a re-run replaces its predecessor). A required check with no matching run is
 * pending, not green: a check that has not reported has not passed.
 *
 * @param {{name: string, app: string}[]} required
 * @param {{name: string, id: number, status: string, conclusion: string|null, app?: {slug?: string}}[]} checkRuns
 * @returns {{state: 'success'|'failure'|'pending', detail: string}}
 */
export function judgeChecks(required, checkRuns) {
    if (!Array.isArray(required) || required.length === 0) {
        throw new Error('no required checks were named, and "all of nothing is green" is not a verdict');
    }
    const failed = [];
    const pending = [];
    for (const { name, app } of required) {
        const runs = (checkRuns ?? []).filter(run => run.name === name && run.app?.slug === app).sort((a, b) => b.id - a.id);
        if (runs.length === 0) {
            pending.push(`${name} from ${app} (not reported yet)`);
            continue;
        }
        const run = runs[0];
        if (run.status !== 'completed') pending.push(`${name} (${run.status})`);
        else if (run.conclusion !== GREEN) failed.push(`${name} concluded ${run.conclusion}`);
    }
    if (failed.length > 0) return { state: 'failure', detail: failed.join('; ') };
    if (pending.length > 0) return { state: 'pending', detail: `waiting for ${pending.join(', ')}` };
    return { state: 'success', detail: `all ${required.length} required checks concluded success` };
}

/**
 * The run a dispatch started, judged from the workflow's dispatch runs. It is matched by
 * the COMMIT it ran on (`head_sha`) and by having been created at or after `since` (minus
 * a minute's clock allowance) — never by the ref's name, because what a run dispatched on
 * a TAG reports as its `head_branch` has not been measured here, while its `head_sha` is
 * the tagged commit by construction. The newest match is the one.
 *
 * @param {{id: number, status: string, conclusion: string|null, created_at: string, head_sha?: string, html_url?: string}[]} runs
 * @param {{since: string, sha: string}} want
 * @returns {{state: 'success'|'failure'|'pending', detail: string}}
 */
export function judgeRun(runs, { since, sha }) {
    const floor = Date.parse(since) - 60_000;
    if (Number.isNaN(floor)) throw new Error(`since ${JSON.stringify(since)} is not an instant`);
    if (!SHA.test(sha ?? '')) throw new Error(`sha ${JSON.stringify(sha)} is not a 40-hex commit`);
    const mine = (runs ?? [])
        .filter(run => run.head_sha === sha && Date.parse(run.created_at) >= floor)
        .sort((a, b) => b.id - a.id);
    if (mine.length === 0) return { state: 'pending', detail: `no dispatched run on ${sha.slice(0, 12)} has appeared yet` };
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

/**
 * What a person does when a stage did not go green — true FOR THAT STAGE. Before the
 * merge the pull request is theirs; after the tag it is not a pull-request matter at
 * all, and the dispatched workflows' own `workflow_run` guard will not start Smithery or
 * the release page for a dispatched npm run, so those are named as by-hand steps.
 */
export function remedy(stage, { version = 'X.Y.Z' } = {}) {
    const tag = `v${version}`;
    if (stage === 'checks') return 'Nothing was merged or tagged. The pull request is left for a person: fix what is red, then merge and tag by hand (CONTRIBUTING, "How a release happens").';
    if (stage === 'publish.yml') {
        return `The pull request is MERGED and ${tag} is TAGGED, but npm did not publish it. Re-run the failed job of this run, or dispatch publish.yml on ${tag} with dry_run=false; ` +
            `once npm serves ${version}, dispatch smithery.yml (version ${version}) and release-page.yml (tag ${tag}) by hand — their workflow_run trigger skips a dispatched npm run.`;
    }
    if (stage === 'smithery.yml') return `npm serves ${version}. Only the Smithery listing is behind: dispatch smithery.yml with version ${version} once the cause is gone.`;
    if (stage === 'release-page.yml') return `npm serves ${version}. Only the release page is missing: dispatch release-page.yml with tag ${tag} once the cause is gone.`;
    return 'See CONTRIBUTING, "How a release happens".';
}

/**
 * An `awaiting-tag` reading: main carries the server's version and npm does not. That is
 * the normal pause between a person's merge and their tag — and it is ALSO what every
 * later hourly run reads after the automatic path stopped halfway, which used to finish
 * green with "the tag is the missing step" while nothing would ever take it. Two cases
 * are therefore red, each with its remedy:
 *
 *   - the tag EXISTS but npm does not serve the version: a publish failed;
 *   - the release pull request was merged by the workflow token and the tag is missing:
 *     the automatic path stopped between its merge and its tag.
 *
 * A person's merge with no tag yet stays the quiet, normal pause.
 *
 * @returns {{stuck: boolean, message: string}}
 */
export function judgeAwaitingTag({ version, tagExists, mergedBy }) {
    const tag = `v${version}`;
    if (tagExists) {
        return {
            stuck: true,
            message: `${tag} exists on origin but npm does not serve ${version}: a publish failed. Dispatch publish.yml on ${tag} with dry_run=false ` +
                `(or re-run the failed run), then dispatch smithery.yml (version ${version}) and release-page.yml (tag ${tag}) by hand.`
        };
    }
    if (BOT_LOGINS.includes(mergedBy)) {
        return {
            stuck: true,
            message: `release/${version} was merged by the workflow but ${tag} was never tagged: the automatic path stopped between its merge and its tag. ` +
                `Tag the merge commit (git tag -a ${tag} <merge sha>) and push the tag yourself — a person's tag push starts publish.yml, and its success starts Smithery and the release page.`
        };
    }
    return { stuck: false, message: `main carries ${version}, untagged, merged by ${mergedBy || 'nobody this run could read'}: the tag is a person's next step` };
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

function client() {
    try {
        return api();
    } catch (error) {
        return usage(oneLine(error.message));
    }
}

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

function finish(label, result, next) {
    if (result.state === 'success') {
        console.log(`auto-release: ${label}: ${result.detail}`);
        process.exit(0);
    }
    console.error(`auto-release: ${label}: NOT GREEN (${result.state}) — ${result.detail}`);
    console.error(`auto-release: ${next}`);
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
        const flags = parseFlags(rest, ['sha', 'required', 'deadline-s', 'interval-s', 'version']);
        if (flags === null || !SHA.test(flags.sha ?? '')) usage('usage: wait-checks --sha <40-hex sha> --required <name@app,…> [--deadline-s N] [--interval-s N]');
        let required;
        try {
            required = parseRequired(flags.required);
        } catch (error) {
            usage(oneLine(error.message));
        }
        const get = client();
        const result = await waitFor({
            read: async () => (await get(`/commits/${flags.sha}/check-runs?per_page=100`)).check_runs,
            judge: runs => judgeChecks(required, runs),
            deadlineMs: seconds(flags['deadline-s'], 30 * 60),
            intervalMs: seconds(flags['interval-s'], 20),
            sleep,
            log: line => console.log(`  ${line}`)
        });
        return finish(`required checks on ${flags.sha}`, result, remedy('checks'));
    }
    if (command === 'wait-run') {
        const flags = parseFlags(rest, ['workflow', 'sha', 'since', 'deadline-s', 'interval-s', 'version']);
        if (flags === null || !/^[\w.-]+\.ya?ml$/u.test(flags.workflow ?? '') || !SHA.test(flags.sha ?? '') || !flags.since) {
            usage('usage: wait-run --workflow <file.yml> --sha <40-hex sha> --since <iso> [--version X.Y.Z] [--deadline-s N] [--interval-s N]');
        }
        if (Number.isNaN(Date.parse(flags.since))) usage(`--since ${JSON.stringify(flags.since)} is not an instant`);
        if (flags.version !== undefined && !VERSION.test(flags.version)) usage(`--version ${JSON.stringify(flags.version)} is not X.Y.Z`);
        const get = client();
        const path = `/actions/workflows/${flags.workflow}/runs?event=workflow_dispatch&per_page=30`;
        const result = await waitFor({
            read: async () => (await get(path)).workflow_runs,
            judge: runs => judgeRun(runs, { since: flags.since, sha: flags.sha }),
            deadlineMs: seconds(flags['deadline-s'], 20 * 60),
            intervalMs: seconds(flags['interval-s'], 15),
            sleep,
            log: line => console.log(`  ${line}`)
        });
        return finish(`${flags.workflow} on ${flags.sha}`, result, remedy(flags.workflow, { version: flags.version }));
    }
    if (command === 'stuck') {
        const flags = parseFlags(rest, ['version', 'tag-exists', 'merged-by']);
        if (flags === null || !VERSION.test(flags.version ?? '') || !['true', 'false'].includes(flags['tag-exists']) || flags['merged-by'] === undefined) {
            usage('usage: stuck --version X.Y.Z --tag-exists true|false --merged-by <login or empty>');
        }
        const verdict = judgeAwaitingTag({ version: flags.version, tagExists: flags['tag-exists'] === 'true', mergedBy: flags['merged-by'] });
        if (verdict.stuck) {
            console.error(`auto-release: STUCK — ${oneLine(verdict.message)}`);
            process.exit(1);
        }
        console.log(`auto-release: ${oneLine(verdict.message)}`);
        process.exit(0);
    }
    return usage('usage: auto-release.mjs decide|wait-checks|wait-run|stuck …');
}

if (import.meta.url === `file://${process.argv[1]}`) {
    await main(process.argv.slice(2));
}

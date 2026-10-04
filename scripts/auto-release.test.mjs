#!/usr/bin/env node
/**
 * The automatic release path's self-test. Hermetic: the decisions are pure functions,
 * the polling loop is driven with an injected sleep, and the two CLI waits read a
 * GitHub API stub on loopback — no request leaves this machine.
 *
 * Pinned, the four cases the owner's decision turns on:
 *
 *   - unchanged surface, every gate green → the automatic (merge) path;
 *   - a changed surface → a draft for a person, whatever else is green;
 *   - a red required check → no merge, and the wait stops at once rather than polling on;
 *   - a check still pending at the deadline → no merge (timeout, never success).
 *
 * And the ways a wait could report green about something it never saw: a required
 * check that has not reported at all, a read that fails on every attempt, an empty
 * list of required checks, a dispatched run that never appears, an older run on the
 * same ref answering for this dispatch. Plus the workflow's own wiring: the merge job
 * is reachable only through `auto == 'true'`, waits before it merges, and the tag is
 * pushed only after the merge.
 *
 *   node scripts/auto-release.test.mjs
 */

import { createServer } from 'node:http';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { decideAutoPath, judgeChecks, judgeRun, parseEnvFile, waitFor } from './auto-release.mjs';
import { createChecker } from './check-harness.mjs';
import { nodePath, runToolAsync } from './tools.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
const SCRIPT = join(HERE, 'auto-release.mjs');
const REQUIRED = ['build-and-test (22)', 'build-and-test (24)', 'SonarCloud Code Analysis'];
const SHA = 'a'.repeat(40);
const MIN_CASES = 30;

const { check, failures, passed } = createChecker();

const green = { state: 'proposed', verdict: 'dated', gates: 'pass', draft: 'false', leaks: 'success' };
const runOf = (name, id, status, conclusion = null) => ({ name, id, status, conclusion });
const allGreen = () => REQUIRED.map((name, i) => runOf(name, i + 1, 'completed', 'success'));

// --- decide -------------------------------------------------------------------------------

console.log('decide');
{
    const d = decideAutoPath(green);
    check('unchanged surface + every gate green → the automatic path', d.auto === true, d.reason);
}
{
    const d = decideAutoPath({ ...green, verdict: 'wrong', draft: 'true' });
    check('a changed surface → not automatic (a draft for a person)', d.auto === false && /surface is not unchanged/u.test(d.reason), d.reason);
}
{
    const d = decideAutoPath({ ...green, gates: 'fail', draft: 'true' });
    check('a failed offline gate → not automatic', d.auto === false && /offline gate/u.test(d.reason), d.reason);
}
{
    const d = decideAutoPath({ ...green, leaks: 'failure' });
    check('a failed leak sweep → not automatic', d.auto === false && /leak sweep/u.test(d.reason), d.reason);
}
{
    const d = decideAutoPath({ ...green, leaks: 'skipped' });
    check('a leak sweep that did not run → not automatic (skipped is not success)', d.auto === false, d.reason);
}
{
    const d = decideAutoPath({ ...green, draft: 'TRUE' });
    check('a draft flag that is not exactly "false" → not automatic', d.auto === false, d.reason);
}
{
    const d = decideAutoPath({});
    check('an empty prepare file → not automatic, and every missing field is named', d.auto === false && (d.reason.match(/absent/gu) ?? []).length === 5, d.reason);
}
{
    const d = decideAutoPath({ ...green, state: 'awaiting-tag' });
    check('nothing prepared → not automatic', d.auto === false && /nothing was prepared/u.test(d.reason), d.reason);
}
{
    const env = parseEnvFile('state=proposed\nversion=1.2.3\nfiles=a,b\n\nnoequals\n');
    check('the prepare file parses key=value lines and ignores the rest', env.state === 'proposed' && env.files === 'a,b' && !('noequals' in env));
}

// --- judging the required checks -----------------------------------------------------------

console.log('judgeChecks');
check('all three required checks success → success', judgeChecks(REQUIRED, allGreen(), []).state === 'success');
{
    const runs = allGreen();
    runs[1] = runOf(REQUIRED[1], 2, 'completed', 'failure');
    const v = judgeChecks(REQUIRED, runs, []);
    check('one required check failed → failure, naming it', v.state === 'failure' && v.detail.includes(REQUIRED[1]), v.detail);
}
{
    const v = judgeChecks(REQUIRED, allGreen().slice(0, 2), []);
    check('a required check that has not reported → pending, never success', v.state === 'pending' && v.detail.includes('not reported yet'), v.detail);
}
{
    const runs = allGreen();
    runs[2] = runOf(REQUIRED[2], 3, 'in_progress');
    check('a required check in progress → pending', judgeChecks(REQUIRED, runs, []).state === 'pending');
}
{
    const runs = [...allGreen(), runOf(REQUIRED[0], 9, 'completed', 'cancelled')];
    check('the NEWEST run of a name counts: a later cancelled run → failure', judgeChecks(REQUIRED, runs, []).state === 'failure');
}
{
    const runs = [runOf(REQUIRED[0], 1, 'completed', 'failure'), ...allGreen().map(run => ({ ...run, id: run.id + 10 }))];
    check('the NEWEST run of a name counts: a later success replaces an earlier failure', judgeChecks(REQUIRED, runs, []).state === 'success');
}
{
    const runs = allGreen();
    runs[0] = runOf(REQUIRED[0], 1, 'completed', 'neutral');
    check('neutral is not success here (stricter than GitHub, on purpose)', judgeChecks(REQUIRED, runs, []).state === 'failure');
}
{
    const runs = allGreen().slice(0, 2);
    const statuses = [{ context: REQUIRED[2], id: 1, state: 'success' }];
    check('a required check reported as a commit status counts', judgeChecks(REQUIRED, runs, statuses).state === 'success');
    const red = [{ context: REQUIRED[2], id: 1, state: 'error' }];
    check('a commit status in error → failure', judgeChecks(REQUIRED, runs, red).state === 'failure');
}
{
    let threw = false;
    try { judgeChecks([], allGreen(), []); } catch { threw = true; }
    check('no required checks named → refused, not "all of nothing is green"', threw);
}

// --- the wait ------------------------------------------------------------------------------

console.log('waitFor');
const noSleep = async () => {};
{
    const answers = [[REQUIRED[0]], REQUIRED.slice(0, 2), REQUIRED];
    let i = 0;
    const r = await waitFor({
        read: async () => answers[Math.min(i++, answers.length - 1)].map((name, k) => runOf(name, k + 1, 'completed', 'success')),
        judge: runs => judgeChecks(REQUIRED, runs, []),
        deadlineMs: 600_000, intervalMs: 20_000, sleep: noSleep
    });
    check('checks green on the 3rd read → success (the merge path proceeds)', r.state === 'success' && r.reads === 3, JSON.stringify(r));
}
{
    let reads = 0;
    const runs = allGreen();
    runs[0] = runOf(REQUIRED[0], 1, 'completed', 'failure');
    const r = await waitFor({
        read: async () => { reads += 1; return runs; },
        judge: x => judgeChecks(REQUIRED, x, []),
        deadlineMs: 600_000, intervalMs: 20_000, sleep: noSleep
    });
    check('a red check → failure on the first read, no further polling (no merge)', r.state === 'failure' && reads === 1, JSON.stringify(r));
}
{
    const pending = allGreen();
    pending[2] = runOf(REQUIRED[2], 3, 'queued');
    let slept = 0;
    const r = await waitFor({
        read: async () => pending,
        judge: x => judgeChecks(REQUIRED, x, []),
        deadlineMs: 100_000, intervalMs: 20_000, sleep: async ms => { slept += ms; }
    });
    check('pending past the deadline → timeout, never success (no merge)', r.state === 'timeout' && /not concluded within 100 s/u.test(r.detail), JSON.stringify(r));
    check('the deadline bounds the wait (no sleep beyond it)', slept <= 100_000, `slept ${slept}`);
}
{
    const r = await waitFor({
        read: async () => { throw new Error('HTTP 502'); },
        judge: x => judgeChecks(REQUIRED, x, []),
        deadlineMs: 60_000, intervalMs: 20_000, sleep: noSleep
    });
    check('a read that fails every time → timeout naming the failed read, never success', r.state === 'timeout' && /read failed/u.test(r.detail), JSON.stringify(r));
}
{
    let i = 0;
    const r = await waitFor({
        read: async () => { i += 1; if (i === 1) throw new Error('HTTP 502'); return allGreen(); },
        judge: x => judgeChecks(REQUIRED, x, []),
        deadlineMs: 60_000, intervalMs: 20_000, sleep: noSleep
    });
    check('one failed read then a green one → success (a failed read is "not yet", not a verdict)', r.state === 'success' && r.reads === 2, JSON.stringify(r));
}

// --- judging a dispatched run --------------------------------------------------------------

console.log('judgeRun');
const SINCE = '2026-10-04T12:00:00Z';
const run = (id, created, status, conclusion = null) => ({ id, created_at: created, status, conclusion, html_url: `https://example.invalid/run/${id}` });
check('no run yet → pending', judgeRun([], SINCE).state === 'pending');
check('an OLDER run on the same ref does not answer for this dispatch',
    judgeRun([run(1, '2026-10-04T10:00:00Z', 'completed', 'success')], SINCE).state === 'pending');
check('the dispatched run in progress → pending', judgeRun([run(2, '2026-10-04T12:00:05Z', 'in_progress')], SINCE).state === 'pending');
check('the dispatched run concluded success → success', judgeRun([run(2, '2026-10-04T12:00:05Z', 'completed', 'success')], SINCE).state === 'success');
{
    const v = judgeRun([run(2, '2026-10-04T12:00:05Z', 'completed', 'failure')], SINCE);
    check('the dispatched run failed → failure, with its link', v.state === 'failure' && v.detail.includes('/run/2'), v.detail);
}
check('the newest qualifying run is the one judged',
    judgeRun([run(2, '2026-10-04T12:00:05Z', 'completed', 'success'), run(3, '2026-10-04T12:00:09Z', 'completed', 'failure')], SINCE).state === 'failure');
{
    const r = await waitFor({
        read: async () => [],
        judge: runs => judgeRun(runs, SINCE),
        deadlineMs: 45_000, intervalMs: 15_000, sleep: noSleep
    });
    check('a dispatched run that never appears → timeout, never success', r.state === 'timeout' && /not appeared/u.test(r.detail), JSON.stringify(r));
}

// --- the CLI against a loopback GitHub stub --------------------------------------------------

console.log('CLI');
async function withApi(answer, body) {
    const server = createServer((request, response) => {
        const { status, json } = answer(request.url);
        response.writeHead(status, { 'content-type': 'application/json' });
        response.end(JSON.stringify(json));
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    try {
        return await body(`http://127.0.0.1:${server.address().port}`);
    } finally {
        server.close();
    }
}

async function cli(args, env = {}) {
    try {
        const stdout = await runToolAsync(nodePath(), [SCRIPT, ...args], {
            encoding: 'utf8',
            env: { PATH: process.env.PATH, GITHUB_REPOSITORY: 'owner/name', GH_TOKEN: 'stub-not-a-token', ...env }
        });
        return { status: 0, out: stdout };
    } catch (error) {
        return { status: error.status, out: `${error.stdout ?? ''}${error.stderr ?? ''}` };
    }
}

const checksApi = checkRuns => url => (url.includes('/check-runs')
    ? { status: 200, json: { check_runs: checkRuns } }
    : { status: 200, json: { statuses: [] } });

{
    const r = await withApi(checksApi(allGreen()), base =>
        cli(['wait-checks', '--sha', SHA, '--required', REQUIRED.join(','), '--deadline-s', '2', '--interval-s', '1'], { GITHUB_API_URL: base }));
    check('wait-checks: all green → exit 0', r.status === 0, r.out);
}
{
    const runs = allGreen();
    runs[2] = runOf(REQUIRED[2], 3, 'completed', 'failure');
    const r = await withApi(checksApi(runs), base =>
        cli(['wait-checks', '--sha', SHA, '--required', REQUIRED.join(','), '--deadline-s', '2', '--interval-s', '1'], { GITHUB_API_URL: base }));
    check('wait-checks: a red check → exit 1 and "left for a person"', r.status === 1 && /left for a person/u.test(r.out), r.out);
}
{
    const runs = allGreen();
    runs[0] = runOf(REQUIRED[0], 1, 'queued');
    const r = await withApi(checksApi(runs), base =>
        cli(['wait-checks', '--sha', SHA, '--required', REQUIRED.join(','), '--deadline-s', '2', '--interval-s', '1'], { GITHUB_API_URL: base }));
    check('wait-checks: pending past --deadline-s → exit 1 (timeout)', r.status === 1 && /timeout/u.test(r.out), r.out);
}
{
    const r = await withApi(() => ({ status: 500, json: {} }), base =>
        cli(['wait-checks', '--sha', SHA, '--required', REQUIRED.join(','), '--deadline-s', '2', '--interval-s', '1'], { GITHUB_API_URL: base }));
    check('wait-checks: an API that errors → exit 1, never 0', r.status === 1 && /HTTP 500/u.test(r.out), r.out);
}
{
    const r = await cli(['wait-checks', '--sha', SHA, '--required', ' , '], { GITHUB_API_URL: 'http://127.0.0.1:9' });
    check('wait-checks: --required naming nothing → exit 2', r.status === 2, r.out);
}
{
    const r = await cli(['wait-checks', '--sha', SHA, '--required', REQUIRED.join(',')], { GITHUB_API_URL: 'http://127.0.0.1:9', GH_TOKEN: '' });
    check('wait-checks: no token → exit 2', r.status === 2, r.out);
}
{
    const r = await cli(['wait-checks', '--sha', SHA, '--required', REQUIRED.join(',')]);
    check('wait-checks: no GITHUB_API_URL → exit 2 (no host is defaulted)', r.status === 2 && /GITHUB_API_URL/u.test(r.out), r.out);
}
{
    const since = new Date().toISOString();
    const r = await withApi(url => (url.includes('/actions/workflows/publish.yml/runs') && url.includes('event=workflow_dispatch') && url.includes('branch=v9.9.9')
        ? { status: 200, json: { workflow_runs: [{ id: 5, created_at: new Date().toISOString(), status: 'completed', conclusion: 'success' }] } }
        : { status: 404, json: {} }), base =>
        cli(['wait-run', '--workflow', 'publish.yml', '--ref', 'v9.9.9', '--since', since, '--deadline-s', '2', '--interval-s', '1'], { GITHUB_API_URL: base }));
    check('wait-run: asks for the dispatch runs of that workflow on that ref; success → exit 0', r.status === 0, r.out);
}
{
    const dir = mkdtempSync(join(tmpdir(), 'auto-release-'));
    try {
        const file = join(dir, 'prepare.env');
        writeFileSync(file, 'state=proposed\nverdict=dated\ngates=pass\ndraft=false\n');
        const yes = await cli(['decide', '--prepare-env', file, '--leaks', 'success']);
        check('decide CLI: a pure mirror → auto=true', yes.status === 0 && /^auto=true$/mu.test(yes.out), yes.out);
        writeFileSync(file, 'state=proposed\nverdict=wrong\ngates=pass\ndraft=true\n');
        const no = await cli(['decide', '--prepare-env', file, '--leaks', 'success']);
        check('decide CLI: a changed surface → auto=false with a reason', no.status === 0 && /^auto=false$/mu.test(no.out) && /^reason=.*surface/mu.test(no.out), no.out);
        const missing = await cli(['decide', '--prepare-env', join(dir, 'absent.env'), '--leaks', 'success']);
        check('decide CLI: an unreadable prepare file → exit 2, no auto line', missing.status === 2 && !/auto=/u.test(missing.out), missing.out);
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
}

// --- the workflow's wiring -----------------------------------------------------------------

console.log('version-sync.yml wiring');
{
    const yml = readFileSync(join(ROOT, '.github/workflows/version-sync.yml'), 'utf8');
    const jobAt = name => yml.search(new RegExp(`^ {2}${name}:$`, 'mu'));
    const release = jobAt('release');
    const downstream = jobAt('publish');
    check('a release job exists after sync, and a publish job after it', jobAt('sync') >= 0 && release > jobAt('sync') && downstream > release);
    const releaseJob = yml.slice(release, downstream);
    const publishJob = yml.slice(downstream);
    check('the release job runs only when sync decided auto == true', /if: needs\.sync\.outputs\.auto == 'true'/u.test(releaseJob));
    const wait = releaseJob.indexOf('auto-release.mjs wait-checks');
    const merge = releaseJob.indexOf('gh pr merge');
    const tag = releaseJob.indexOf('git push origin "refs/tags/');
    check('it waits for the checks, THEN merges, THEN pushes the tag', wait > 0 && merge > wait && tag > merge, `${wait} ${merge} ${tag}`);
    check('the merge is a merge commit pinned to the head that was checked', /gh pr merge "\$PR" --merge --match-head-commit "\$SHA"/u.test(releaseJob));
    check('nothing on the release path continues on error', !/continue-on-error/u.test(releaseJob) && !/continue-on-error/u.test(publishJob));
    const npm = publishJob.indexOf('gh workflow run publish.yml');
    const npmWait = publishJob.indexOf('wait-run --workflow publish.yml');
    const smithery = publishJob.indexOf('gh workflow run smithery.yml');
    const page = publishJob.indexOf('gh workflow run release-page.yml');
    check('npm is dispatched (a GITHUB_TOKEN tag push starts nothing) and waited for before Smithery and the page',
        npm > 0 && npmWait > npm && smithery > npmWait && page > npmWait, `${npm} ${npmWait} ${smithery} ${page}`);
    check('the npm dispatch publishes for real (dry_run=false) on the tag ref', /gh workflow run publish\.yml --ref "\$TAG" -f dry_run=false/u.test(publishJob));
    check('the workflow grants nothing at the top level', /^permissions: \{\}$/mu.test(yml));
    const uses = [...yml.matchAll(/^ *- uses: (\S+)/gmu)].map(m => m[1]);
    check('every action is pinned to a commit sha (and the scan found the six steps)', uses.length >= 6 && uses.every(u => /@[0-9a-f]{40}$/u.test(u)), uses.join(' '));
}

const total = passed() + failures.length;
console.log(`\nauto-release self-test: ${passed()} passed, ${failures.length} failed`);
if (total < MIN_CASES) {
    console.error(`auto-release self-test: only ${total} cases ran, fewer than ${MIN_CASES} — the suite did not read what it claims to`);
    process.exit(2);
}
process.exit(failures.length === 0 ? 0 : 1);

#!/usr/bin/env node
/**
 * The automatic release path's self-test. Hermetic: the decisions are pure functions,
 * the polling loop is driven with an injected sleep, and the CLI waits read a GitHub API
 * stub on loopback — no request leaves this machine.
 *
 * Pinned, the four cases the owner's decision turns on:
 *
 *   - unchanged surface, every gate green → the automatic (merge) path;
 *   - a changed surface, or one the probe could not classify → a draft for a person;
 *   - a red required check → no merge, and the wait stops at once rather than polling on;
 *   - a check still pending at the deadline → no merge (timeout, never success).
 *
 * And the ways a wait could report green about something it never saw: a required
 * check that has not reported, the right name from the WRONG app, a read that fails on
 * every attempt, an empty or app-less list of required checks, a dispatched run that
 * never appears, a run on another commit or from before the dispatch. The stuck-release
 * judgement for an `awaiting-tag` reading, both red cases and the quiet one. Each
 * stage's failure message tells the truth about what has already happened. Plus the
 * workflow's own wiring.
 *
 *   node scripts/auto-release.test.mjs
 */

import { createServer } from 'node:http';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { decideAutoPath, judgeAwaitingTag, judgeChecks, judgeRun, parseEnvFile, parseRequired, remedy, waitFor } from './auto-release.mjs';
import { createChecker } from './check-harness.mjs';
import { nodePath, runToolAsync } from './tools.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
const SCRIPT = join(HERE, 'auto-release.mjs');
const REQUIRED_TEXT = 'build-and-test (22)@github-actions,build-and-test (24)@github-actions,SonarCloud Code Analysis@sonarqubecloud';
const REQ = parseRequired(REQUIRED_TEXT);
const SHA = 'a'.repeat(40);
const OTHER_SHA = 'b'.repeat(40);
const MIN_CASES = 50;

const { check, failures, passed } = createChecker();

const green = { state: 'proposed', verdict: 'dated', gates: 'pass', draft: 'false', leaks: 'success' };
const runOf = (i, id, status, conclusion = null, app = REQ[i].app) => ({ name: REQ[i].name, id, status, conclusion, app: { slug: app } });
const allGreen = () => REQ.map((_, i) => runOf(i, i + 1, 'completed', 'success'));

// --- decide -------------------------------------------------------------------------------

console.log('decide');
{
    const d = decideAutoPath(green);
    check('unchanged surface + every gate green → the automatic path', d.auto === true, d.reason);
}
{
    const d = decideAutoPath({ ...green, verdict: 'wrong', draft: 'true' });
    check('a changed surface → not automatic (a draft for a person)', d.auto === false && /not known to be unchanged/u.test(d.reason), d.reason);
}
{
    const d = decideAutoPath({ ...green, verdict: 'unclassified' });
    check('an UNCLASSIFIED probe report → not automatic, even with every other field green', d.auto === false && /verdict unclassified/u.test(d.reason), d.reason);
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

// --- the required-check list ---------------------------------------------------------------

console.log('parseRequired');
check('name@app pairs parse, a parenthesis in the name included',
    REQ.length === 3 && REQ[0].name === 'build-and-test (22)' && REQ[0].app === 'github-actions' && REQ[2].app === 'sonarqubecloud');
for (const [text, label] of [['', 'an empty list'], [' , ', 'a list of blanks'], ['build-and-test (22)', 'a check with no app'], ['@github-actions', 'an app with no name']]) {
    let threw = false;
    try { parseRequired(text); } catch { threw = true; }
    check(`${label} is refused, never "all of nothing is green"`, threw);
}

// --- judging the required checks -----------------------------------------------------------

console.log('judgeChecks');
check('all three required checks success → success', judgeChecks(REQ, allGreen()).state === 'success');
{
    const runs = allGreen();
    runs[1] = runOf(1, 2, 'completed', 'failure');
    const v = judgeChecks(REQ, runs);
    check('one required check failed → failure, naming it', v.state === 'failure' && v.detail.includes(REQ[1].name), v.detail);
}
{
    const v = judgeChecks(REQ, allGreen().slice(0, 2));
    check('a required check that has not reported → pending, never success', v.state === 'pending' && v.detail.includes('not reported yet'), v.detail);
}
{
    const runs = allGreen();
    runs[2] = runOf(2, 3, 'completed', 'success', 'some-other-app');
    const v = judgeChecks(REQ, runs);
    check('the right NAME from the wrong APP does not count → pending', v.state === 'pending' && v.detail.includes('from sonarqubecloud'), v.detail);
}
{
    const runs = [...allGreen(), runOf(0, 9, 'completed', 'failure', 'some-other-app')];
    check('a red run of the same name from another app does not redden the real one', judgeChecks(REQ, runs).state === 'success');
}
{
    const runs = allGreen();
    runs[2] = runOf(2, 3, 'in_progress');
    check('a required check in progress → pending', judgeChecks(REQ, runs).state === 'pending');
}
{
    const runs = [...allGreen(), runOf(0, 9, 'completed', 'cancelled')];
    check('the NEWEST run of a check counts: a later cancelled run → failure', judgeChecks(REQ, runs).state === 'failure');
}
{
    const runs = [runOf(0, 1, 'completed', 'failure'), ...allGreen().map(run => ({ ...run, id: run.id + 10 }))];
    check('the NEWEST run of a check counts: a later success replaces an earlier failure', judgeChecks(REQ, runs).state === 'success');
}
{
    const runs = allGreen();
    runs[0] = runOf(0, 1, 'completed', 'neutral');
    check('neutral is not success here (stricter than GitHub, on purpose)', judgeChecks(REQ, runs).state === 'failure');
}
{
    let threw = false;
    try { judgeChecks([], allGreen()); } catch { threw = true; }
    check('no required checks named → refused', threw);
}

// --- the wait ------------------------------------------------------------------------------

console.log('waitFor');
const noSleep = async () => {};
{
    const answers = [allGreen().slice(0, 1), allGreen().slice(0, 2), allGreen()];
    let i = 0;
    const r = await waitFor({
        read: async () => answers[Math.min(i++, answers.length - 1)],
        judge: runs => judgeChecks(REQ, runs),
        deadlineMs: 600_000, intervalMs: 20_000, sleep: noSleep
    });
    check('checks green on the 3rd read → success (the merge path proceeds)', r.state === 'success' && r.reads === 3, JSON.stringify(r));
}
{
    let reads = 0;
    const runs = allGreen();
    runs[0] = runOf(0, 1, 'completed', 'failure');
    const r = await waitFor({
        read: async () => { reads += 1; return runs; },
        judge: x => judgeChecks(REQ, x),
        deadlineMs: 600_000, intervalMs: 20_000, sleep: noSleep
    });
    check('a red check → failure on the first read, no further polling (no merge)', r.state === 'failure' && reads === 1, JSON.stringify(r));
}
{
    const pending = allGreen();
    pending[2] = runOf(2, 3, 'queued');
    let slept = 0;
    const r = await waitFor({
        read: async () => pending,
        judge: x => judgeChecks(REQ, x),
        deadlineMs: 100_000, intervalMs: 20_000, sleep: async ms => { slept += ms; }
    });
    check('pending past the deadline → timeout, never success (no merge)', r.state === 'timeout' && /not concluded within 100 s/u.test(r.detail), JSON.stringify(r));
    check('the deadline bounds the wait (no sleep beyond it)', slept <= 100_000, `slept ${slept}`);
}
{
    const r = await waitFor({
        read: async () => { throw new Error('HTTP 502'); },
        judge: x => judgeChecks(REQ, x),
        deadlineMs: 60_000, intervalMs: 20_000, sleep: noSleep
    });
    check('a read that fails every time → timeout naming the failed read, never success', r.state === 'timeout' && /read failed/u.test(r.detail), JSON.stringify(r));
}
{
    let i = 0;
    const r = await waitFor({
        read: async () => { i += 1; if (i === 1) throw new Error('HTTP 502'); return allGreen(); },
        judge: x => judgeChecks(REQ, x),
        deadlineMs: 60_000, intervalMs: 20_000, sleep: noSleep
    });
    check('one failed read then a green one → success (a failed read is "not yet", not a verdict)', r.state === 'success' && r.reads === 2, JSON.stringify(r));
}

// --- judging a dispatched run --------------------------------------------------------------

console.log('judgeRun');
const SINCE = '2026-10-04T12:00:00Z';
const want = { since: SINCE, sha: SHA };
const run = (id, created, status, conclusion = null, headSha = SHA) => ({ id, created_at: created, status, conclusion, head_sha: headSha, html_url: `https://example.invalid/run/${id}` });
check('no run yet → pending', judgeRun([], want).state === 'pending');
check('an OLDER run on the same commit does not answer for this dispatch',
    judgeRun([run(1, '2026-10-04T10:00:00Z', 'completed', 'success')], want).state === 'pending');
check('a run on ANOTHER commit does not answer for this dispatch',
    judgeRun([run(2, '2026-10-04T12:00:05Z', 'completed', 'success', OTHER_SHA)], want).state === 'pending');
check('the dispatched run in progress → pending', judgeRun([run(2, '2026-10-04T12:00:05Z', 'in_progress')], want).state === 'pending');
check('the dispatched run concluded success → success', judgeRun([run(2, '2026-10-04T12:00:05Z', 'completed', 'success')], want).state === 'success');
{
    const v = judgeRun([run(2, '2026-10-04T12:00:05Z', 'completed', 'failure')], want);
    check('the dispatched run failed → failure, with its link', v.state === 'failure' && v.detail.includes('/run/2'), v.detail);
}
check('the newest matching run is the one judged',
    judgeRun([run(2, '2026-10-04T12:00:05Z', 'completed', 'success'), run(3, '2026-10-04T12:00:09Z', 'completed', 'failure')], want).state === 'failure');
{
    let threw = false;
    try { judgeRun([], { since: SINCE, sha: 'abc' }); } catch { threw = true; }
    check('a sha that is not 40 hex is refused', threw);
}
{
    const r = await waitFor({
        read: async () => [],
        judge: runs => judgeRun(runs, want),
        deadlineMs: 45_000, intervalMs: 15_000, sleep: noSleep
    });
    check('a dispatched run that never appears → timeout, never success', r.state === 'timeout' && /has appeared yet/u.test(r.detail), JSON.stringify(r));
}

// --- what each stage's failure says ---------------------------------------------------------

console.log('remedy');
check('a red CHECK says nothing was merged and the PR is a person\'s', /Nothing was merged or tagged/u.test(remedy('checks')) && /left for a person/u.test(remedy('checks')));
{
    const m = remedy('publish.yml', { version: '9.9.9' });
    check('a failed NPM run says merged and tagged, not "left for a person"', /MERGED and v9\.9\.9 is TAGGED/u.test(m) && !/left for a person/u.test(m), m);
    check('…and names both recoveries and the two by-hand dispatches after it',
        /Re-run the failed job/u.test(m) && /dispatch publish\.yml on v9\.9\.9 with dry_run=false/u.test(m)
        && /smithery\.yml \(version 9\.9\.9\)/u.test(m) && /release-page\.yml \(tag v9\.9\.9\)/u.test(m) && /workflow_run trigger skips a dispatched npm run/u.test(m), m);
}
check('a failed Smithery run says npm already serves the version', /npm serves 9\.9\.9/u.test(remedy('smithery.yml', { version: '9.9.9' })));
check('a failed release-page run says npm already serves the version', /npm serves 9\.9\.9/u.test(remedy('release-page.yml', { version: '9.9.9' })));

// --- a stuck release behind an awaiting-tag reading ------------------------------------------

console.log('judgeAwaitingTag');
{
    const v = judgeAwaitingTag({ version: '9.9.9', tagExists: true, mergedBy: 'a-person' });
    check('the tag EXISTS but npm lacks the version → stuck, naming the publish dispatch',
        v.stuck && /a publish failed/u.test(v.message) && /dispatch publish\.yml on v9\.9\.9 with dry_run=false/iu.test(v.message), v.message);
}
for (const login of ['github-actions', 'github-actions[bot]', 'app/github-actions']) {
    const v = judgeAwaitingTag({ version: '9.9.9', tagExists: false, mergedBy: login });
    check(`merged by the workflow token (${login}) and untagged → stuck, naming the hand tag`,
        v.stuck && /stopped between its merge and its tag/u.test(v.message) && /git tag -a v9\.9\.9/u.test(v.message), v.message);
}
{
    const v = judgeAwaitingTag({ version: '9.9.9', tagExists: false, mergedBy: 'a-person' });
    check('a PERSON\'s merge, not yet tagged → the normal quiet pause, not stuck', !v.stuck, v.message);
}

// --- the CLI against a loopback GitHub stub --------------------------------------------------

console.log('CLI');
async function withApi(answer, body) {
    const seen = [];
    const server = createServer((request, response) => {
        seen.push(request.url);
        const { status, json } = answer(request.url);
        response.writeHead(status, { 'content-type': 'application/json' });
        response.end(JSON.stringify(json));
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    try {
        return await body(`http://127.0.0.1:${server.address().port}`, seen);
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

const checksApi = checkRuns => url => (url.includes('/check-runs') ? { status: 200, json: { check_runs: checkRuns } } : { status: 404, json: {} });
const waitArgs = ['wait-checks', '--sha', SHA, '--required', REQUIRED_TEXT, '--deadline-s', '2', '--interval-s', '1'];

{
    const r = await withApi(checksApi(allGreen()), base => cli(waitArgs, { GITHUB_API_URL: base }));
    check('wait-checks: all green → exit 0', r.status === 0, r.out);
}
{
    const runs = allGreen();
    runs[2] = runOf(2, 3, 'completed', 'failure');
    const r = await withApi(checksApi(runs), base => cli(waitArgs, { GITHUB_API_URL: base }));
    check('wait-checks: a red check → exit 1, "Nothing was merged" and "left for a person"', r.status === 1 && /Nothing was merged/u.test(r.out) && /left for a person/u.test(r.out), r.out);
}
{
    const runs = allGreen();
    runs[0] = runOf(0, 1, 'queued');
    const r = await withApi(checksApi(runs), base => cli(waitArgs, { GITHUB_API_URL: base }));
    check('wait-checks: pending past --deadline-s → exit 1 (timeout)', r.status === 1 && /timeout/u.test(r.out), r.out);
}
{
    const r = await withApi(() => ({ status: 500, json: {} }), base => cli(waitArgs, { GITHUB_API_URL: base }));
    check('wait-checks: an API that errors → exit 1, never 0', r.status === 1 && /HTTP 500/u.test(r.out), r.out);
}
{
    const r = await cli(['wait-checks', '--sha', SHA, '--required', 'build-and-test (22)'], { GITHUB_API_URL: 'http://127.0.0.1:9' });
    check('wait-checks: a required check with no app → exit 2', r.status === 2 && /name@app-slug/u.test(r.out), r.out);
}
{
    const r = await cli(['wait-checks', '--sha', SHA, '--required', REQUIRED_TEXT], { GITHUB_API_URL: 'http://127.0.0.1:9', GH_TOKEN: '' });
    check('wait-checks: no token → exit 2', r.status === 2, r.out);
}
{
    const r = await cli(['wait-checks', '--sha', SHA, '--required', REQUIRED_TEXT]);
    check('wait-checks: no GITHUB_API_URL → exit 2 (no host is defaulted)', r.status === 2 && /GITHUB_API_URL/u.test(r.out), r.out);
}
{
    const since = new Date().toISOString();
    const runsApi = conclusion => url => (url.includes('/actions/workflows/publish.yml/runs') && url.includes('event=workflow_dispatch')
        ? { status: 200, json: { workflow_runs: [{ id: 5, head_sha: SHA, created_at: new Date().toISOString(), status: 'completed', conclusion }] } }
        : { status: 404, json: {} });
    const args = ['wait-run', '--workflow', 'publish.yml', '--sha', SHA, '--version', '9.9.9', '--since', since, '--deadline-s', '2', '--interval-s', '1'];
    const ok = await withApi(runsApi('success'), (base, seen) => cli(args, { GITHUB_API_URL: base }).then(r => ({ ...r, seen })));
    check('wait-run: asks for the dispatch runs of that workflow and matches the commit; success → exit 0', ok.status === 0, ok.out);
    check('wait-run: the run list is not narrowed by a ref name it cannot be sure of', ok.seen.every(url => !url.includes('branch=')), ok.seen.join(' '));
    const red = await withApi(runsApi('failure'), base => cli(args, { GITHUB_API_URL: base }));
    check('wait-run: a failed npm run → exit 1 saying MERGED and TAGGED, with the recovery', red.status === 1 && /MERGED and v9\.9\.9 is TAGGED/u.test(red.out) && !/left for a person/u.test(red.out), red.out);
}
{
    const yes = await cli(['stuck', '--version', '9.9.9', '--tag-exists', 'true', '--merged-by', '']);
    check('stuck CLI: tag exists, npm lacks it → exit 1 with the remedy', yes.status === 1 && /STUCK/u.test(yes.out) && /publish failed/u.test(yes.out), yes.out);
    const bot = await cli(['stuck', '--version', '9.9.9', '--tag-exists', 'false', '--merged-by', 'github-actions']);
    check('stuck CLI: merged by the workflow, no tag → exit 1 with the remedy', bot.status === 1 && /git tag -a v9\.9\.9/u.test(bot.out), bot.out);
    const quiet = await cli(['stuck', '--version', '9.9.9', '--tag-exists', 'false', '--merged-by', 'a-person']);
    check('stuck CLI: a person\'s merge awaiting their tag → exit 0', quiet.status === 0, quiet.out);
    const bad = await cli(['stuck', '--version', '9.9.9', '--tag-exists', 'maybe', '--merged-by', '']);
    check('stuck CLI: a tag-exists that is not true/false → exit 2, never "not stuck"', bad.status === 2, bad.out);
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
    const sync = jobAt('sync');
    const release = jobAt('release');
    const downstream = jobAt('publish');
    check('a release job exists after sync, and a publish job after it', sync >= 0 && release > sync && downstream > release);
    const syncJob = yml.slice(sync, release);
    const releaseJob = yml.slice(release, downstream);
    const publishJob = yml.slice(downstream);
    check('sync judges an awaiting-tag reading for a stuck release, with both facts read and a failed read refused',
        /if: steps\.detect\.outputs\.state == 'awaiting-tag'/u.test(syncJob) && /auto-release\.mjs stuck --version/u.test(syncJob)
        && /2\) tag_exists=false/u.test(syncJob) && /\*\) echo "Could not ask origin/u.test(syncJob));
    check('the release job runs only when sync decided auto == true', /if: needs\.sync\.outputs\.auto == 'true'/u.test(releaseJob));
    const wait = releaseJob.indexOf('auto-release.mjs wait-checks');
    const merge = releaseJob.indexOf('gh pr merge');
    const tag = releaseJob.indexOf('git push origin "refs/tags/');
    check('it waits for the checks, THEN merges, THEN pushes the tag', wait > 0 && merge > wait && tag > merge, `${wait} ${merge} ${tag}`);
    check('the merge is a merge commit pinned to the head that was checked', /gh pr merge "\$PR" --merge --match-head-commit "\$SHA"/u.test(releaseJob));
    check('the merge sha is validated as exactly 40 hex', /grep -Eq '\^\[0-9a-f\]\{40\}\$'/u.test(releaseJob));
    {
        const m = /REQUIRED_CHECKS: '([^']+)'/u.exec(releaseJob);
        let ok = false;
        try { ok = m !== null && parseRequired(m[1]).length === 3; } catch { ok = false; }
        check('the workflow\'s required checks parse as name@app, all three', ok, m?.[1] ?? '(none)');
    }
    check('nothing on the release path continues on error', !/continue-on-error/u.test(releaseJob) && !/continue-on-error/u.test(publishJob));
    const npm = publishJob.indexOf('gh workflow run publish.yml');
    const npmWait = publishJob.indexOf('wait-run --workflow publish.yml --sha "$MERGE_SHA"');
    const smithery = publishJob.indexOf('gh workflow run smithery.yml');
    const page = publishJob.indexOf('gh workflow run release-page.yml');
    check('npm is dispatched, waited for by the merge commit, and only then Smithery and the page',
        npm > 0 && npmWait > npm && smithery > npmWait && page > npmWait, `${npm} ${npmWait} ${smithery} ${page}`);
    check('the npm dispatch publishes for real (dry_run=false) on the tag ref', /gh workflow run publish\.yml --ref "\$TAG" -f dry_run=false/u.test(publishJob));
    {
        const deadlines = [...publishJob.matchAll(/--deadline-s "\$\(\((\d+) \* 60\)\)"/gu)].reduce((sum, m) => sum + Number(m[1]), 0);
        const timeout = Number(/timeout-minutes: (\d+)/u.exec(publishJob)?.[1] ?? 0);
        check('the publish job\'s step deadlines fit inside its timeout', deadlines > 0 && deadlines < timeout, `deadlines ${deadlines} min, timeout ${timeout} min`);
    }
    {
        const deadline = Number(/wait-checks[^\n]*--deadline-s "\$\(\((\d+) \* 60\)\)"/u.exec(releaseJob)?.[1] ?? 0);
        const timeout = Number(/timeout-minutes: (\d+)/u.exec(releaseJob)?.[1] ?? 0);
        check('the release job\'s check deadline fits inside its timeout', deadline > 0 && deadline < timeout, `deadline ${deadline} min, timeout ${timeout} min`);
    }
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

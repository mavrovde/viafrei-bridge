#!/usr/bin/env node
// Self-test for the history leg's SCOPE.
//
// The leg used to read `git rev-list --all`. CI checks out with
// fetch-depth: 0, so every remote branch is present in every job's clone, and
// one unmerged branch carrying a finding turned every other branch's run red.
// It now reads `git rev-list HEAD` by default and takes `--all-refs` for the
// publishing build, which answers for every ref rather than only for its own
// ancestry. Every ref is not the whole repository -- see the rev-list comment
// in check-leaks.mjs for what it does and does not cover.
//
// That change had no test: the tarball gate's 107 cases all stayed green with
// the scoping reverted, which is the silent-skip class in its usual clothes --
// a behaviour nothing reads is a behaviour nothing protects. These cases fail
// if the default goes back to every ref, if --all-refs stops meaning every
// ref, or if the residue diagnostic stops telling the two scopes apart.
import { strict as assert } from 'node:assert';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync, copyFileSync, readFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const cases = [];
let failed = 0;

function git(cwd, args) {
    // The fixture must not inherit a contributor's global configuration: a
    // signing key it cannot reach turns every case in this file into a
    // failure about something the file is not testing.
    execFileSync(
        'git',
        ['-c', 'color.ui=false', '-c', 'commit.gpgsign=false', '-c', 'tag.gpgsign=false', ...args],
        { cwd, stdio: 'pipe' }
    );
}

// Runs the sweep in `cwd` and reports how it exited. Never throws on a
// finding: a non-zero exit IS the thing under test here.
function sweep(cwd, args) {
    try {
        const stdout = execFileSync('node', [join(cwd, 'scripts/check-leaks.mjs'), ...args], {
            cwd,
            stdio: 'pipe',
            encoding: 'utf8',
        });
        return { code: 0, out: stdout };
    } catch (error) {
        return { code: error.status ?? -1, out: `${error.stdout ?? ''}${error.stderr ?? ''}` };
    }
}

function check(name, fn) {
    try {
        fn();
        cases.push(`  ok   ${name}`);
    } catch (error) {
        failed += 1;
        cases.push(`  FAIL ${name}\n       ${error.message.split('\n')[0]}`);
    }
}

// The finding this fixture plants: a bare five-digit number that is not on
// the allow-list. Deliberately an ordinary number and nothing else -- this
// file must never carry a real secret to prove a point about secrets.
//
// ASSEMBLED, not written. A five-digit literal here is itself a finding, and
// the sweep duly caught the first version of this file, in the tree and in
// the history, on the run that was rehearsing a publish. The two ways out
// were to widen numbers.allowed for a value that is not real, or to stop
// writing it as a bare number; widening an allow-list to accommodate a test
// is how an allow-list stops describing anything. It is built at run time
// instead, which the sweep says plainly it cannot see -- that gap is stated
// in its own limits, and using it for a fixture is not the same as using it
// for a secret.
//
// The bound, so nobody reads this as a licence: it is for a value that is
// INVENTED, in a test, whose whole purpose is to be found by the sweep in the
// next breath. Never assemble a real one. A value that must not be in this
// repository is not made acceptable by being spelled at run time -- the sweep
// would simply stop seeing it, which is worse than being told.
const STRAY = '9'.repeat(5);

// A repository with the sweep in it, a clean `main`, and a `side` branch that
// `main` does not reach carrying that finding.
function buildRepo(root) {
    mkdirSync(join(root, 'scripts'));
    for (const file of ['check-leaks.mjs', 'rules.mjs']) {
        copyFileSync(join(here, file), join(root, 'scripts', file));
    }
    // The real ruleset names residue blobs that exist only in the real
    // repository. Here they would all report "matched no blob in this
    // history" and drown the signal, so the fixture keeps every rule except
    // that list, which is about one specific history and not about scope.
    const rules = JSON.parse(readFileSync(join(here, 'rules.json'), 'utf8'));
    rules.historyNumberResidue = [];
    // numbers.allowed is kept exactly as it is, and cannot be emptied: the
    // sweep refuses an empty rule list, and it also refuses an allow-list
    // entry that occurs in no tracked file -- an entry not in the tree is
    // suppressing a finding about a value somebody removed. Both refusals are
    // right and neither is about scope, so the fixture satisfies them instead
    // of switching them off: the values are written into a tracked file,
    // straight out of the ruleset, without this test ever naming one.
    writeFileSync(join(root, 'scripts', 'rules.json'), JSON.stringify(rules, null, 4));

    git(root, ['init', '-q', '-b', 'main']);
    git(root, ['config', 'user.email', 'sweep@example.invalid']);
    git(root, ['config', 'user.name', 'sweep self-test']);
    writeFileSync(join(root, 'kept.txt'), 'nothing of interest here\n');
    writeFileSync(
        join(root, 'allowed.txt'),
        `${rules.numbers.allowed.map(value => `allowed: ${value}`).join('\n')}\n`
    );
    git(root, ['add', '.']);
    git(root, ['commit', '-q', '-m', 'the sweep and a clean file']);

    git(root, ['checkout', '-q', '-b', 'side']);
    writeFileSync(join(root, 'stray.txt'), `an ordinary bare number: ${STRAY}\n`);
    git(root, ['add', 'stray.txt']);
    git(root, ['commit', '-q', '-m', 'a finding on a branch main does not reach']);
    git(root, ['checkout', '-q', 'main']);
}

// The directory is created HERE, before the try, and buildRepo() is handed one
// that already exists. Two earlier arrangements both leaked it on a throw: the
// first created it before any try at all, and the second -- which claimed in
// this comment to have fixed that -- created it as buildRepo()'s first
// statement and assigned `repo` from the return value, so `repo` was still
// undefined while every git call inside was free to throw, and the finally
// duly skipped the cleanup it was guarding. Creation is the one step that has
// to happen outside, because a path is all the cleanup needs.
const repo = mkdtempSync(join(tmpdir(), 'sweep-scope-'));
try {
    buildRepo(repo);
    // The defect, stated as a test: standing on `main`, whose own history and
    // whose own working tree are clean, another branch must not redden it.
    check('the default scope does not report a finding that lives only on another branch', () => {
        const { code, out } = sweep(repo, ['--history']);
        assert.equal(code, 0, `expected a clean exit, got ${code}:\n${out}`);
        assert.match(out, /this ref only/u, 'the run does not say which scope it used');
    });

    // The other half: the narrowing must be a choice, not a loss. If
    // --all-refs stops meaning every ref this passes silently, so assert the
    // finding is actually found.
    check('--all-refs does report it', () => {
        const { code, out } = sweep(repo, ['--history', '--all-refs']);
        assert.equal(code, 1, `expected one finding (exit 1), got ${code}:\n${out}`);
        assert.match(out, /every ref/u, 'the run does not say which scope it used');
    });

    // Scope is a property of the history leg alone. A finding in the file the
    // working tree actually holds must be caught under either scope, or the
    // narrowing has taken something real with it.
    check('the working-tree leg is unaffected by the scope', () => {
        writeFileSync(join(repo, 'kept.txt'), `an ordinary bare number: ${STRAY}\n`);
        try {
            for (const args of [['--history'], ['--history', '--all-refs']]) {
                const { code, out } = sweep(repo, args);
                assert.equal(code, 1, `expected a finding under ${args.join(' ')}, got ${code}:\n${out}`);
            }
        } finally {
            writeFileSync(join(repo, 'kept.txt'), 'nothing of interest here\n');
        }
    });

    // Blocker from review: blobExists() was a sound proxy for "unreachable
    // from any ref" only while the leg read every ref. Under the default it
    // must not diagnose a squash or a rewrite at a reader whose history is
    // intact -- the exit code was right and the sentence was wrong, and the
    // sentence is the part a person acts on.
    check('the residue diagnostic does not blame a rewrite under the default scope', () => {
        const rulesPath = join(repo, 'scripts', 'rules.json');
        const rules = JSON.parse(readFileSync(rulesPath, 'utf8'));
        const blob = execFileSync('git', ['rev-parse', 'side:stray.txt'], {
            cwd: repo,
            encoding: 'utf8',
        }).trim();
        rules.historyNumberResidue = [{ blob, findings: 1 }];
        writeFileSync(rulesPath, JSON.stringify(rules, null, 4));

        const scoped = sweep(repo, ['--history']);
        assert.equal(scoped.code, 1, `expected the unmatched entry to be a finding, got ${scoped.code}`);
        assert.match(
            scoped.out,
            /re-run with --all-refs/u,
            `the default scope should say the history may simply not reach it:\n${scoped.out}`
        );
        assert.ok(
            !/squash or a rewritten history/u.test(scoped.out),
            `the default scope must not diagnose a rewrite:\n${scoped.out}`
        );

        // Same entry, every ref: the blob IS reachable, so the entry applies
        // and the run is clean. This is what proves the message above is
        // about scope and not about the entry being broken.
        const all = sweep(repo, ['--history', '--all-refs']);
        assert.equal(all.code, 0, `expected the entry to apply under --all-refs, got ${all.code}:\n${all.out}`);
    });
} finally {
    rmSync(repo, { recursive: true, force: true });
}

console.log(cases.join('\n'));
if (failed > 0) {
    console.error(`\nsweep scope self-test: FAIL - ${failed} of ${cases.length} case(s)`);
    process.exit(1);
}
console.log(`\nsweep scope self-test: PASS - ${cases.length} cases`);

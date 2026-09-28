#!/usr/bin/env node
/**
 * The version gate's self-test.
 *
 * The gate itself is twenty lines of comparison, so the thing worth testing is not the
 * comparison — it is that the gate can SAY NO, and that it says no for the right reason
 * with the right exit code. Issue #18 asks for the mutant proof explicitly: bump one
 * field, watch it go red, restore, watch it go green. Done here rather than in a
 * terminal, because a proof nobody can re-run is a story about a proof.
 *
 * The two exit codes are the substance. **2** means the gate could not run — a file is
 * missing, unreadable or the wrong shape — and **1** means it ran and found a mismatch.
 * Collapsing those would let "I could not read the lockfile" look like "I read it and
 * was satisfied", which is the §5b failure this repository refuses everywhere else.
 *
 *   node scripts/check-versions.test.mjs
 */

import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { nodePath, runTool } from './tools.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
const GATE = join(HERE, 'check-versions.mjs');

let passed = 0;
const failures = [];

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
    console.error(`check-versions self-test: ${message}`);
    process.exit(2);
}

/** Run the gate against a throwaway root. Returns { status, out }. */
function run(root) {
    try {
        const out = runTool(nodePath(), [GATE], {
            encoding: 'utf8',
            env: { ...process.env, VF_VERSIONS_ROOT: root }
        });
        return { status: 0, out };
    } catch (error) {
        return { status: error.status ?? -1, out: `${error.stdout ?? ''}${error.stderr ?? ''}` };
    }
}

const roots = [];
function fixture(mutate) {
    const root = mkdtempSync(join(tmpdir(), 'viafrei-versions-'));
    roots.push(root);
    const manifest = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
    const lockfile = JSON.parse(readFileSync(join(ROOT, 'package-lock.json'), 'utf8'));
    const state = { manifest, lockfile, writeManifest: true, writeLockfile: true };
    mutate(state);
    if (state.writeManifest) writeFileSync(join(root, 'package.json'), JSON.stringify(state.manifest, null, 2));
    if (state.writeLockfile) writeFileSync(join(root, 'package-lock.json'), JSON.stringify(state.lockfile, null, 2));
    return root;
}

// --- Precondition: the real tree is the state the gate is supposed to accept ---------
//
// If this repository were itself mismatched, every "red" case below would pass for the
// wrong reason and the green case would be the only real signal. So it is asserted
// first, and it doubles as the control.
{
    const manifest = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
    const lockfile = JSON.parse(readFileSync(join(ROOT, 'package-lock.json'), 'utf8'));
    const three = [manifest.version, lockfile.version, lockfile.packages?.['']?.version];
    if (new Set(three).size !== 1 || typeof three[0] !== 'string') {
        refuse(`this repository's own three version fields are ${JSON.stringify(three)} — fix the tree before trusting this suite`);
    }
}

// --- The green case, on the real tree -----------------------------------------------
{
    const result = run(ROOT);
    check('the real tree passes, and the run prints all three values it compared',
        result.status === 0
        && /PASS - all three agree at /u.test(result.out)
        && (result.out.match(/= \d+\.\d+\.\d+/gu) ?? []).length === 3,
        `status ${result.status}, out ${JSON.stringify(result.out.slice(0, 120))}`);
}

// --- The DEFAULT root, with no override at all ---------------------------------------
//
// Every other case sets VF_VERSIONS_ROOT, including the green one, which passes the real
// root through the override - so without this the default path is never exercised and a
// wrong default would be invisible here. This repository's convention for a named root
// override is that a self-test pins BOTH directions.
{
    const clean = { ...process.env };
    delete clean.VF_VERSIONS_ROOT;
    let status = 0;
    let out = '';
    try {
        out = runTool(nodePath(), [GATE], { encoding: 'utf8', cwd: ROOT, env: clean });
    } catch (error) {
        status = error.status ?? -1;
        out = `${error.stdout ?? ''}${error.stderr ?? ''}`;
    }
    check('with no VF_VERSIONS_ROOT it reads this repository and passes',
        status === 0 && /PASS - all three agree at /u.test(out),
        `status ${status}, out ${JSON.stringify(out.slice(0, 120))}`);
}

// --- Red: each field moved on its own ------------------------------------------------
for (const [label, mutate] of [
    ['package.json alone', state => { state.manifest.version = '9.9.9'; }],
    ['the lockfile root alone', state => { state.lockfile.version = '9.9.9'; }],
    ['the lockfile packages[""] alone', state => { state.lockfile.packages[''].version = '9.9.9'; }]
]) {
    const result = run(fixture(mutate));
    check(`${label} moved is refused with exit 1 and all three printed`,
        result.status === 1
        && /disagree about the version/u.test(result.out)
        && /9\.9\.9/u.test(result.out)
        && (result.out.match(/= \S+/gu) ?? []).length === 3,
        `status ${result.status}, out ${JSON.stringify(result.out.slice(0, 140))}`);
}

// --- Refusals: the gate could not run. Exit 2, and never confusable with success -----
for (const [label, mutate, needle] of [
    ['a missing lockfile', state => { state.writeLockfile = false; }, 'never a skip'],
    ['a missing manifest', state => { state.writeManifest = false; }, 'never a skip'],
    ['a lockfile with no packages[""]', state => { delete state.lockfile.packages['']; }, 'not a version string'],
    ['a manifest with no version', state => { delete state.manifest.version; }, 'not a version string'],
    ['a non-string version', state => { state.manifest.version = 3; }, 'not a version string']
]) {
    const result = run(fixture(mutate));
    check(`${label} is refused with exit 2, naming why`,
        result.status === 2 && result.out.includes(needle),
        `status ${result.status}, out ${JSON.stringify(result.out.slice(0, 140))}`);
}

// --- The one that would silently agree about nothing ---------------------------------
//
// Three absent fields are all `undefined`, and `undefined === undefined`. A gate that
// compared before checking presence would report agreement on a file with no versions
// in it at all. This is the case that says it does not.
{
    const result = run(fixture(state => {
        delete state.manifest.version;
        delete state.lockfile.version;
        delete state.lockfile.packages[''].version;
    }));
    check('all three ABSENT is a refusal, not a report of agreement',
        result.status === 2 && /not a version string/u.test(result.out),
        `status ${result.status}, out ${JSON.stringify(result.out.slice(0, 140))}`);
}

// --- Invalid JSON is a refusal, not a crash -----------------------------------------
{
    const root = mkdtempSync(join(tmpdir(), 'viafrei-versions-'));
    roots.push(root);
    writeFileSync(join(root, 'package.json'), '{ not json');
    writeFileSync(join(root, 'package-lock.json'), '{}');
    const result = run(root);
    check('a manifest that is not JSON is refused with exit 2',
        result.status === 2 && /not valid JSON/u.test(result.out),
        `status ${result.status}, out ${JSON.stringify(result.out.slice(0, 120))}`);
}

for (const root of roots) rmSync(root, { recursive: true, force: true });

console.log('');
if (failures.length > 0) {
    console.error(`check-versions self-test: FAIL - ${failures.length} of ${passed + failures.length} case(s)`);
    for (const failure of failures) console.error(`  - ${failure}`);
    process.exit(1);
}
console.log(`check-versions self-test: PASS - ${passed} cases`);

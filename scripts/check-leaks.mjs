#!/usr/bin/env node
/**
 * Repository leak sweep.
 *
 * This repository is public and the platform it talks to is not. Nothing that
 * describes the platform - a table, a role, a provider portal, an internal
 * port - may appear here, in any file, including a workflow, a test fixture or
 * a comment.
 *
 * **Nothing is skipped.** The previous version skipped exactly one file, the
 * one that listed the forbidden names in the clear - which is where the leak
 * turned out to be. The names are salted hashes now (`scripts/rules.json`), so
 * the rules file is an ordinary file and gets scanned like every other.
 *
 * Findings report a hash prefix and a location, never the name: this output
 * ends up in a CI log on a public repository.
 *
 * Usage:
 *   node scripts/check-leaks.mjs              # tracked files in the working tree
 *   node scripts/check-leaks.mjs --history    # every blob in every commit too
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { blindSpots, loadRules, scanFile } from './rules.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const RULES = loadRules(ROOT);

const git = args =>
    execFileSync('git', ['-c', 'color.ui=false', ...args], { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });

const log = message => {
    process.stdout.write(`${message}\n`);
};
const findings = [];

/**
 * `package-lock.json` is generated, and the URLs in it are upstream projects'
 * funding links, not ours. Everything else about it is scanned, including the
 * private-name check; only the host allow-list is relaxed, and the run says so.
 */
const HOST_EXEMPT = new Set(['package-lock.json']);
const hostExpression = /\bhttps?:\/\/([A-Za-z0-9._-]+)/gu;

function scan(label, text, checkHosts) {
    scanFile({
        label,
        text,
        patterns: RULES.repositoryPatterns,
        rules: RULES,
        onFinding: finding => findings.push(`${finding.where} ${finding.detail}`)
    });
    if (!checkHosts) {
        return;
    }
    for (const [index, line] of text.split('\n').entries()) {
        hostExpression.lastIndex = 0;
        let host;
        while ((host = hostExpression.exec(line)) !== null) {
            if (!RULES.allowedHosts.has(host[1])) {
                findings.push(`${label}:${index + 1} host not on the allow-list - ${host[1]}`);
            }
        }
    }
}

function isProbablyText(buffer) {
    return !buffer.includes(0);
}

const withHistory = process.argv.includes('--history');

/**
 * Stop, loudly, rather than pass on nothing.
 *
 * Exit 2, never 0: this leg guards the only public repository we have, and a
 * run that scanned nothing must not be reported as a run that found nothing.
 * Until now this file asserted no count at all - in a repository with no
 * commits it printed `0 blobs across 0 commits` and `PASS`.
 */
const refuse = reason => {
    log('');
    log(`sweep: CANNOT RUN - ${reason}`);
    log('sweep: this is a failure, not a pass: a check that read nothing has not checked anything');
    process.exit(2);
};

if (RULES.tokenHashes.size === 0) {
    refuse('the rules file lists no private-name hashes');
}
if (RULES.repositoryPatterns.length === 0) {
    refuse('the rules file lists no repository patterns');
}
if (RULES.allowedHosts.size === 0) {
    refuse('the rules file lists no allowed hosts, so every host would pass');
}

log(`sweep: ${RULES.repositoryPatterns.length} generic patterns, ${RULES.tokenHashes.size} private-name hashes, ${RULES.allowedHosts.size} allowed hosts`);
log('sweep: no file is skipped - the rules file holds hashes, not names, so it is scanned like any other');
log(`sweep: host allow-list not applied to ${[...HOST_EXEMPT].join(', ')} (generated; every other check still is)`);
log('sweep: reading each line as plaintext, base64, hex, percent-encoding, JavaScript escapes and concatenated literals');
log(`sweep: cannot see ${blindSpots(RULES).join('; ')}`);

const tracked = git(['ls-files', '-z']).split('\0').filter(name => name !== '');
if (tracked.length === 0) {
    refuse('git lists no tracked files here - wrong directory, or a repository with nothing in it');
}
let scanned = 0;
let binary = 0;
for (const file of tracked) {
    const buffer = readFileSync(join(ROOT, file));
    if (!isProbablyText(buffer)) {
        binary += 1;
        continue;
    }
    scan(file, buffer.toString('utf8'), !HOST_EXEMPT.has(file));
    scanned += 1;
}
log(`sweep: ${scanned} tracked text files scanned, ${binary} binary (of ${tracked.length} tracked)`);
// Every tracked file is accounted for, by name, not by hope.
if (scanned + binary !== tracked.length) {
    refuse(`${tracked.length} files are tracked but ${scanned + binary} were accounted for`);
}
if (scanned === 0) {
    refuse('not one tracked file was read as text');
}

if (withHistory) {
    const revisions = git(['rev-list', '--all']).split('\n').filter(line => line !== '');
    let blobs = 0;
    for (const revision of revisions) {
        const entries = git(['ls-tree', '-r', '-z', revision]).split('\0').filter(entry => entry !== '');
        for (const entry of entries) {
            const [meta, path] = entry.split('\t');
            const sha = meta.split(' ')[2];
            const buffer = execFileSync('git', ['cat-file', 'blob', sha], { cwd: ROOT, maxBuffer: 64 * 1024 * 1024 });
            if (!isProbablyText(buffer)) {
                continue;
            }
            scan(`${revision.slice(0, 7)}:${path}`, buffer.toString('utf8'), !HOST_EXEMPT.has(path));
            blobs += 1;
        }
    }
    log(`sweep: ${blobs} blobs across ${revisions.length} commits scanned`);
    if (revisions.length === 0) {
        refuse('--history was asked for and there are no commits to read');
    }
    if (blobs === 0) {
        refuse(`${revisions.length} commits hold no readable blob between them`);
    }
    // A floor derived from this repository rather than typed in: the history
    // contains at least the current commit's tree, so it cannot hold fewer text
    // blobs than the working tree holds text files.
    if (blobs < scanned) {
        refuse(`${blobs} blobs in the whole history is fewer than the ${scanned} text files in the working tree`);
    }
}

log('');
if (findings.length > 0) {
    log(`sweep: FAIL - ${findings.length} finding(s)`);
    for (const finding of findings) {
        log(`  ! ${finding}`);
    }
    process.exit(1);
}
log('sweep: PASS - no private name in any encoding, no forbidden pattern, every host on the allow-list');

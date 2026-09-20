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
 * Findings report a hash prefix, a length and a location, never the value:
 * this output ends up in a CI log on a public repository. That applies to a
 * host and to a path as much as to a name.
 *
 * **One exemption exists, and it is not an exemption for a file.** History
 * cannot be edited - a push is a publication, and a rewrite does not recall an
 * object a stranger already fetched - so the numeric findings that are already
 * in this repository's history are recorded in `historyNumberResidue` by BLOB,
 * and suppressed for the `number` rule only, in the history leg only. A blob
 * is immutable, so such an entry can never grow to cover a line added later;
 * every entry must be matched exactly as often as it claims or the run
 * refuses; and the working tree is never exempt from anything.
 *
 * Usage:
 *   node scripts/check-leaks.mjs              # tracked files in the working tree
 *   node scripts/check-leaks.mjs --history    # every blob in every commit too
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { blindSpots, loadRules, opaque, safeString, scanFile, thresholds } from './rules.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));

const log = message => {
    process.stdout.write(`${message}\n`);
};

/**
 * Stop, loudly, rather than pass on nothing.
 *
 * Exit 2, never 0 and never 1: this leg guards the only public repository we
 * have, a run that scanned nothing must not be reported as a run that found
 * nothing, and it must not be reported as a run that found something either.
 * Until round 3 this file asserted no count at all - in a repository with no
 * commits it printed `0 blobs across 0 commits` and `PASS`.
 */
const refuse = reason => {
    log('');
    log(`sweep: CANNOT RUN - ${reason}`);
    log('sweep: this is a failure, not a pass: a check that read nothing has not checked anything');
    process.exit(2);
};

let RULES;
try {
    RULES = loadRules(ROOT);
    // Validates the token range, the numbers window and the allow-list, and
    // throws when any of them has stopped being able to match. Done HERE, at
    // the top, so the answer is exit 2 rather than an uncaught exception on
    // the first line of the first file.
    thresholds(RULES);
} catch (error) {
    refuse(`the ruleset cannot be used - ${error instanceof Error ? error.message : String(error)}`);
}

/**
 * Every git call goes through here, and a git that FAILS is a refusal.
 *
 * Run outside a repository this file used to die with an uncaught exception
 * and exit 1 - the code that means "findings" - for a condition it defines
 * exit 2 for. The exit status and the subcommand are printed, never git's own
 * message: that message carries the absolute path of the checkout, and this
 * output goes to a public CI log.
 */
const runGit = (args, options = {}) => {
    try {
        return execFileSync('git', ['-c', 'color.ui=false', ...args], { cwd: ROOT, maxBuffer: 64 * 1024 * 1024, ...options });
    } catch (error) {
        return refuse(`git ${args[0]} could not be run here (exit ${error?.status ?? 'none'}) - is this a git repository?`);
    }
};
const git = args => runGit(args, { encoding: 'utf8' });

const findings = [];

/**
 * `package-lock.json` is generated, and the URLs in it are upstream projects'
 * funding links, not ours. Everything else about it is scanned, including the
 * private-name check; only the host allow-list is relaxed, and the run says so.
 */
const HOST_EXEMPT = new Set(['package-lock.json']);
const hostExpression = /\bhttps?:\/\/([A-Za-z0-9._-]+)/gu;

/**
 * Accepted numeric residue in the history, keyed by blob. See
 * `_historyNumberResidue` in rules.json for why it is keyed that way and what
 * it deliberately does not say.
 */
const RESIDUE = new Map(RULES.historyNumberResidue.map(entry => [entry.blob, entry]));
const residueSeen = new Map();

function scan(label, text, checkHosts, blob) {
    const residue = blob === undefined ? undefined : RESIDUE.get(blob);
    const seen = residue === undefined ? undefined : (residueSeen.get(blob) ?? { scans: 0, suppressed: 0 });
    if (seen !== undefined) {
        seen.scans += 1;
        residueSeen.set(blob, seen);
    }
    scanFile({
        label,
        text,
        patterns: RULES.repositoryPatterns,
        rules: RULES,
        onFinding: finding => {
            // The `number` rule only, and only for a blob that is named in the
            // residue list. Every other kind of finding in the same blob is a
            // finding, which is what keeps this from being an exemption for a
            // file - the shape the last leak hid behind.
            if (seen !== undefined && finding.kind === 'number') {
                seen.suppressed += 1;
                return;
            }
            findings.push(`${finding.where} ${finding.detail}`);
        }
    });
    if (!checkHosts) {
        return;
    }
    for (const [index, line] of text.split('\n').entries()) {
        hostExpression.lastIndex = 0;
        let host;
        while ((host = hostExpression.exec(line)) !== null) {
            if (!RULES.allowedHosts.has(host[1])) {
                // The allow-list is the definition of "may be named here", so a
                // host that fails it is by construction not approved for
                // publication - and this line goes straight into a public CI
                // log. Length and hash prefix; open the file at the line to see
                // which host it is.
                findings.push(`${label}:${index + 1} host not on the allow-list (${opaque(host[1], RULES)})`);
            }
        }
    }
}

function isProbablyText(buffer) {
    return !buffer.includes(0);
}

const withHistory = process.argv.includes('--history');

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
log('sweep: a name is looked for across every separator and at camel-case boundaries, and in the file path as well as the contents');
if (RESIDUE.size > 0) {
    log(`sweep: ${RESIDUE.size} historical blob(s) carry accepted numeric residue and are named by content address in rules.json - the number rule only, history only, never the working tree`);
}
log(`sweep: cannot see ${blindSpots(RULES).join('; ')}`);

const tracked = git(['ls-files', '-z']).split('\0').filter(name => name !== '');
if (tracked.length === 0) {
    refuse('git lists no tracked files here - wrong directory, or a repository with nothing in it');
}
/**
 * The allow-list's own claim, checked instead of promised.
 *
 * `_numbers` says the entries are "the numbers that are here, which they can
 * already see". In round 4 that was false of exactly one entry: it was in no
 * tracked file, so it existed only to silence a finding about a value that had
 * been taken OUT of the tree - and a single diff of the list against the tree
 * isolated it, which is a caption pointing straight at the value the inverse
 * construction exists to avoid publishing.
 *
 * So the claim is now a check. An entry that occurs nowhere but in the rules
 * file is a refusal, and the message carries a count and no index, because an
 * index into a published list is the value.
 */
const RULES_PATH = 'scripts/rules.json';
const allowedSeen = new Set();
const occurrences = new Map(
    [...RULES.numbers.allowed].map(entry => [entry, new RegExp(`(?<![0-9])${entry}(?![0-9])`, 'u')])
);

let scanned = 0;
const skipped = [];
for (const file of tracked) {
    const buffer = readFileSync(join(ROOT, file));
    if (!isProbablyText(buffer)) {
        skipped.push(file);
        continue;
    }
    const text = buffer.toString('utf8');
    if (file !== RULES_PATH) {
        for (const [entry, expression] of occurrences) {
            if (!allowedSeen.has(entry) && expression.test(text)) {
                allowedSeen.add(entry);
            }
        }
    }
    scan(file, text, !HOST_EXEMPT.has(file));
    scanned += 1;
}
const absent = RULES.numbers.allowed.size - allowedSeen.size;
if (absent > 0) {
    refuse(
        `${absent} of the ${RULES.numbers.allowed.size} numbers.allowed entries occur in no tracked file except ${RULES_PATH}. ` +
            'An allow-list entry that is not in the tree is not describing what is here - it is suppressing a finding about a value somebody removed, ' +
            'and one diff against the tree isolates it, which is the caption the allow-list exists to avoid. Take it out; if the value is in the history, ' +
            'record the blob under historyNumberResidue instead.'
    );
}
log(`sweep: all ${RULES.numbers.allowed.size} numbers.allowed entries occur in the working tree outside ${RULES_PATH}, as the list claims`);
const binary = skipped.length;
log(`sweep: ${scanned} tracked text files scanned, ${binary} binary (of ${tracked.length} tracked)`);
// Named, not counted. One NUL byte anywhere in a file takes it out of this
// scan entirely, and a count cannot tell you that the file which left is a
// source file - "the one file we do not read" is how the last leak survived,
// and it does not have to be an exemption to be one.
for (const file of skipped) {
    log(`sweep:   not scanned, it contains a NUL byte and is read as binary: ${safeString(file, RULES)}`);
}
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
            const buffer = runGit(['cat-file', 'blob', sha]);
            if (!isProbablyText(buffer)) {
                continue;
            }
            scan(`${revision.slice(0, 7)}:${path}`, buffer.toString('utf8'), !HOST_EXEMPT.has(path), sha);
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
    // An exemption that has quietly stopped applying is the silent-skip
    // failure in another hat, so each one has to have been used, and used
    // exactly as much as it claims. A blob is immutable, so these numbers can
    // only change if the scanner's behaviour changed - which is precisely the
    // thing worth being told about.
    let suppressed = 0;
    for (const entry of RULES.historyNumberResidue) {
        if (!Number.isInteger(entry.findings) || entry.findings < 1) {
            refuse('a historyNumberResidue entry does not declare a whole number of findings of at least 1');
        }
        const seen = residueSeen.get(entry.blob);
        if (seen === undefined) {
            refuse(`a historyNumberResidue entry names a blob that is not in this history - a stale exemption suppresses nothing and hides that it suppresses nothing (hash prefix ${entry.blob.slice(0, 12)}…)`);
        }
        if (seen.suppressed !== seen.scans * entry.findings) {
            refuse(
                `a historyNumberResidue blob was scanned ${seen.scans} time(s) and yielded ${seen.suppressed} number finding(s), not the ${seen.scans * entry.findings} it claims (hash prefix ${entry.blob.slice(0, 12)}…)`
            );
        }
        suppressed += seen.suppressed;
    }
    if (RULES.historyNumberResidue.length > 0) {
        log(`sweep: ${suppressed} number finding(s) suppressed as recorded historical residue, across ${RESIDUE.size} blob(s); every one accounted for`);
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

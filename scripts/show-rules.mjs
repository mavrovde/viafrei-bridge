#!/usr/bin/env node
/**
 * Print the rules in a form a human can read.
 *
 * `scripts/rules.json` stores its patterns base64-encoded so that the file is
 * not a match for itself, and stores the private names only as salted hashes.
 * Neither is meant to make the rules hard to read, so this exists.
 */
import { fileURLToPath } from 'node:url';
import { blindSpots, loadRules, thresholds } from './rules.mjs';

/**
 * Guarded like the checks are. This one has no verdict to give, so it cannot
 * report a false pass - but it used to end in an uncaught exception and a
 * stack trace carrying absolute paths, which is the wrong way for anything in
 * a leak-hygiene repository to fail, and "it is only a printer" is how the
 * next unguarded loader gets written.
 */
let rules;
let limits;
try {
    rules = loadRules(fileURLToPath(new URL('..', import.meta.url)));
    limits = thresholds(rules);
} catch (error) {
    const text = (error instanceof Error ? error.message : String(error)).replace(/\s+/gu, ' ').trim();
    console.error(`rules: CANNOT RUN - the ruleset could not be read - ${text.length > 200 ? `${text.slice(0, 199)}…` : text}`);
    process.exit(2);
}

const show = (title, list) => {
    console.log(`\n${title}`);
    for (const rule of list) {
        console.log(`  ${rule.label.padEnd(28)} /${rule.source}/${rule.flags ?? ''}`);
    }
};

console.log('rules: generic patterns (plain shapes, nothing private about them)');
show('repository sweep', rules.repositoryPatterns);
show('published tarball', rules.tarballPatterns);
show('embedded sources (tarball, non-prose files)', rules.embeddedSourcePatterns);

console.log(`\nprivate names: ${rules.tokenHashes.size} salted ${'sha256'} hashes, ${rules.minTokenLength}-${rules.maxTokenLength} characters, no plaintext anywhere in this repository`);
console.log(`salt: ${rules.salt}`);
console.log('\nA finding reports a hash prefix and a location, never the name itself:');
console.log('a CI log on a public repository is as public as the file would have been.');

console.log(`\nallowed hosts: ${[...rules.allowedHosts].join(', ')}`);
console.log(`allowed numbers: ${rules.numbers.allowed.size} entries of ${limits.minDigits}-${limits.maxDigits} digits, every one of which occurs in the working tree`);
console.log(`historical numeric residue: ${rules.historyNumberResidue.length} blob(s), named by content address, suppressed in the history leg only`);
console.log(`\nthe decoders are sized to the shortest rule: base64 runs from ${limits.base64MinRun} characters, hex from ${limits.hexMinRun}`);
console.log(`\nthe scanner cannot see:`);
for (const spot of blindSpots(rules)) {
    console.log(`  - ${spot}`);
}

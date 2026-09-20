#!/usr/bin/env node
/**
 * Print the rules in a form a human can read.
 *
 * `scripts/rules.json` stores its patterns base64-encoded so that the file is
 * not a match for itself, and stores the private names only as salted hashes.
 * Neither is meant to make the rules hard to read, so this exists.
 */
import { fileURLToPath } from 'node:url';
import { blindSpots, loadRules } from './rules.mjs';

const rules = loadRules(fileURLToPath(new URL('..', import.meta.url)));

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

console.log(`\nprivate names: ${rules.tokenHashes.size} salted ${'sha256'} hashes, no plaintext anywhere in this repository`);
console.log(`salt: ${rules.salt}`);
console.log('\nA finding reports a hash prefix and a location, never the name itself:');
console.log('a CI log on a public repository is as public as the file would have been.');

console.log(`\nallowed hosts: ${[...rules.allowedHosts].join(', ')}`);
console.log(`\nthe scanner cannot see: ${blindSpots().join('; ')}`);

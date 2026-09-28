#!/usr/bin/env node
/**
 * The manifest's version and BOTH of the lockfile's must agree.
 *
 * WHY THIS EXISTS, and it is the one that actually bit. Cutting 1.3.15 left
 * `package.json` saying `1.3.15` while `package-lock.json` still said `1.3.12`, on a
 * tree seven review rounds had confirmed. Every gate this repository owns passed. The
 * measured reason: **`npm ci` does not compare the root `version` field at all** —
 * checked on npm 11.19.1 and on the 12.0.2 the publish workflow pins — so nothing in
 * build, test, pack, publish-hygiene or the tarball gate reads that pair. It was found
 * by a person reading the two files side by side, which is not a gate.
 *
 * It has since been kept in step by hand at every release: 1.3.16 and 1.3.22 each wrote
 * three version fields deliberately and said so in their commit messages. "Done
 * deliberately" is precisely the failure mode, because the only thing holding it
 * together is somebody remembering.
 *
 *   node scripts/check-versions.mjs
 *
 * Exit codes are distinct on purpose: **2** means this check could not run (a file is
 * missing, unreadable, or not the shape it must be) and **1** means it ran and the
 * versions disagree. A gate that cannot read its input must not be able to look like a
 * gate that read it and was satisfied.
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = process.env.VF_VERSIONS_ROOT ?? join(dirname(fileURLToPath(import.meta.url)), '..');
const MANIFEST = join(ROOT, 'package.json');
const LOCKFILE = join(ROOT, 'package-lock.json');

function refuse(message) {
    console.error(`check-versions: ${message}`);
    process.exit(2);
}

function read(path, label) {
    let text;
    try {
        text = readFileSync(path, 'utf8');
    } catch (error) {
        refuse(`cannot read ${label} at ${path} — ${error.message}. A missing file is a failure here, never a skip.`);
    }
    try {
        return JSON.parse(text);
    } catch (error) {
        refuse(`${label} at ${path} is not valid JSON — ${error.message}`);
    }
    return undefined;
}

const manifest = read(MANIFEST, 'package.json');
const lockfile = read(LOCKFILE, 'package-lock.json');

// Each field is required to EXIST and to be a string before anything is compared:
// three `undefined`s are all equal to one another, which would be a gate reporting
// agreement about nothing.
const fields = [
    ['package.json .version', manifest.version],
    ['package-lock.json .version', lockfile.version],
    ['package-lock.json .packages[""].version', lockfile.packages?.['']?.version]
];
for (const [label, value] of fields) {
    if (typeof value !== 'string' || value.length === 0) {
        refuse(
            `${label} is ${value === undefined ? 'absent' : JSON.stringify(value)}, not a version string. ` +
            'Three absent fields would compare equal, so this refuses rather than agreeing about nothing.'
        );
    }
}

const distinct = new Set(fields.map(([, value]) => value));
const printed = fields.map(([label, value]) => `    ${label} = ${value}`).join('\n');

if (distinct.size !== 1) {
    console.error(
        'check-versions: the manifest and the lockfile disagree about the version.\n' +
        `${printed}\n` +
        '  `npm ci` does not compare the root `version` field, so no other gate here reads this pair. ' +
        'Run `npm version <the version> --no-git-tag-version`, or edit all three, and commit the lockfile.'
    );
    process.exit(1);
}

console.log(`check-versions: PASS - all three agree at ${[...distinct][0]}`);
console.log(printed);

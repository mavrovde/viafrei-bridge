/**
 * The one check every self-test here owes its throwaway fixture.
 *
 * WHY THIS EXISTS, in two steps, because the second one is the interesting half.
 *
 * Several self-tests build a throwaway repository by copying a hand-written list of
 * files into it. A list written by
 * hand falls behind an import, and when it does the copied script dies of
 * `ERR_MODULE_NOT_FOUND` — which does not read as "a file is missing". It reads as
 * whatever the suite was measuring: measured on `check-leaks.test.mjs`, three of
 * its four cases failed with messages about SCOPE, and the fourth PASSED, because
 * a sweep that cannot start also cannot report a finding. So the list needs a
 * precondition that names the real cause.
 *
 * The second step: the first repair COPIED that precondition from one self-test
 * into the other, eleven lines of it. SonarCloud then failed the pull request on
 * **3.1% duplication on new code** — over a 3% limit — and the duplicated block
 * was exactly those eleven lines. Copying was the wrong half of the right idea.
 * Two files holding two copies of one precondition is also the defect on its own
 * terms: the next change to it updates one of them.
 *
 * So the logic lives here once, and each caller keeps its own wording — the refusals
 * name different builders (`buildRepo()`, `buildGateRoot()`, `buildRoot()`) and exit
 * by different routes, and that difference is real rather than incidental. No count
 * of callers is written here: this file gained a third one and the sentence that
 * said "both" went stale unnoticed, which is the same failure it exists to prevent.
 *
 * This module is NOT copied into any fixture root, and must not be: the check runs in
 * the host process, against the copied directory, and none of the copied scripts
 * import it.
 */

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Every local `./…` import of a copied script that is not present beside it.
 *
 * Returns a list of human-readable strings, empty when the fixture is complete —
 * so a caller decides how to announce the refusal, and the caller cannot decide
 * whether to make one: an empty list is the only thing that lets a suite proceed.
 *
 * `scriptsDir` defaults to `scripts` because both fixtures put them there; it is
 * a parameter rather than a constant so the next fixture with a different layout
 * does not have to copy this function to change one string.
 */
export function missingFixtureImports(root, scriptsDir = 'scripts') {
    const missing = [];
    const dir = join(root, scriptsDir);
    for (const file of readdirSync(dir).filter(name => name.endsWith('.mjs'))) {
        const source = readFileSync(join(dir, file), 'utf8');
        for (const match of source.matchAll(/from\s+'\.\/([\w.-]+)'/gu)) {
            if (!existsSync(join(dir, match[1]))) {
                missing.push(`${file} imports ./${match[1]}`);
            }
        }
    }
    return missing;
}

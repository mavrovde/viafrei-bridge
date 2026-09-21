#!/usr/bin/env node
/**
 * One reader for `npm pack --json`, because its shape is not ours to assume.
 *
 * Two shapes exist in the wild, and both are correct for the npm that emits
 * them:
 *
 *   - **npm 11 and earlier** print a JSON **array**, one entry per tarball.
 *   - **npm 12 and later** print a JSON **object keyed by package name**,
 *     the same shape `npm publish --json` has always had.
 *
 * The change is deliberate and was announced in npm's own source before it
 * landed: npm 11's `lib/commands/pack.js` carries
 *
 *     // XXX(BREAKING_CHANGE): publish outputs a json object with package
 *     // names as keys. Pack should do the same here instead of an array
 *     logTar(tar, { unicode, json, key: index })
 *
 * and npm 12 does exactly that - `logTar(tar, { unicode, json, key: tar.name })`
 * - in the major release where a breaking change belongs.
 *
 * Three call sites used to parse that output by hand, and the one that read
 * `JSON.parse(stdout)[0].filename` died of a `TypeError` with a stack trace of
 * absolute paths the first time a CI runner installed npm 12. That is the
 * wrong failure for this repository twice over: the gates here exit with
 * defined codes and say what they could not do, and a public job's log should
 * not print a path it was not asked about. So the parsing lives here, once,
 * and what it cannot read it REFUSES with one line.
 *
 * The line names the npm version, because "npm pack printed something I cannot
 * read" is only actionable next to which npm printed it.
 *
 * Usage as a module:
 *   import { soleTarball, soleTarballFilename, PackJsonError } from './npm-pack-json.mjs';
 *
 * Usage as a program (this is what the publish workflow runs):
 *   npm pack --json | node scripts/npm-pack-json.mjs
 *     -> the one filename on stdout, exit 0
 *     -> one line on stderr, exit 2, when there is not exactly one
 */
import { execFileSync } from 'node:child_process';
import { realpathSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';

/** Where a reader should look when npm changes shape a third time. */
export const PIN_LOCATION = '.github/workflows/publish.yml (NPM_VERSION)';

/** A refusal, not a crash: the caller turns this into its own exit code. */
export class PackJsonError extends Error {
    constructor(message) {
        super(message);
        this.name = 'PackJsonError';
    }
}

/**
 * The installed npm's version, or `unknown`.
 *
 * Asking costs a subprocess and is only done on the failure path, where the
 * answer is the whole point. It must not be able to fail: a diagnostic that
 * throws while explaining a throw tells nobody anything.
 */
export function npmVersion() {
    try {
        const out = execFileSync('npm', ['--version'], {
            encoding: 'utf8',
            stdio: ['ignore', 'pipe', 'ignore']
        });
        const trimmed = out.trim();
        return /^[\w.+-]{1,32}$/u.test(trimmed) ? trimmed : 'unknown';
    } catch {
        return 'unknown';
    }
}

/** A package name, in the npm sense - scoped or not. */
const PACKAGE_NAME = /^(?:@[a-z0-9~][a-z0-9-._~]*\/)?[a-z0-9~][a-z0-9-._~]*$/u;

/**
 * Say what arrived WITHOUT quoting it.
 *
 * npm's JSON can carry absolute paths (an `error.summary` does, routinely),
 * and this runs in a public log. So the description is structural - the type,
 * how many entries, and key names only when they look like package names,
 * which is the one part that is by definition publishable. Everything else is
 * counted rather than echoed.
 */
export function describeShape(value) {
    if (value === null) {
        return 'null';
    }
    if (Array.isArray(value)) {
        return `an array of ${value.length} entr${value.length === 1 ? 'y' : 'ies'}`;
    }
    if (typeof value !== 'object') {
        return `a JSON ${typeof value}`;
    }
    const keys = Object.keys(value);
    if (keys.length === 1 && keys[0] === 'error') {
        const code = value.error !== null && typeof value.error === 'object' ? value.error.code : undefined;
        // The code only. `summary` and `detail` are prose with paths in them.
        return `an npm error object (code ${typeof code === 'string' ? code : 'not stated'})`;
    }
    const safe = keys.filter(key => PACKAGE_NAME.test(key));
    const shown = safe.length === keys.length ? `: ${safe.join(', ')}` : '';
    return `an object with ${keys.length} key${keys.length === 1 ? '' : 's'}${shown}`;
}

/**
 * Normalise either shape into a list of entries.
 *
 * An entry is whatever npm reported about one tarball; only `filename` is
 * required, because that is all any caller here needs and the rest of the
 * record has changed fields before.
 */
export function packEntries(stdout) {
    const text = typeof stdout === 'string' ? stdout : String(stdout ?? '');
    let parsed;
    try {
        parsed = JSON.parse(text);
    } catch {
        // Not the text: see describeShape(). A length and the fact that it was
        // not JSON is the whole actionable content.
        throw new PackJsonError(
            `its output is not JSON (${text.trim().length} bytes on stdout)`
        );
    }
    const isEntry = entry => entry !== null && typeof entry === 'object' && typeof entry.filename === 'string';
    if (Array.isArray(parsed)) {
        // npm <= 11.
        if (!parsed.every(isEntry)) {
            throw new PackJsonError(`it printed ${describeShape(parsed)}, and not every entry names a filename`);
        }
        return parsed;
    }
    if (parsed !== null && typeof parsed === 'object') {
        // npm >= 12, keyed by package name - unless it is an error report.
        const values = Object.values(parsed);
        if (values.length > 0 && values.every(isEntry)) {
            return values;
        }
        throw new PackJsonError(`it printed ${describeShape(parsed)}, which names no tarball`);
    }
    throw new PackJsonError(`it printed ${describeShape(parsed)}, which names no tarball`);
}

/**
 * The one entry, or a refusal.
 *
 * "Exactly one" is not pedantry: every caller here packs a single package and
 * then hands the result to a gate or to `npm publish`. Two, or none, means the
 * command did something other than what was asked, and guessing which file to
 * publish is the one thing a publish pipeline may never do.
 */
export function soleTarball(stdout, { npm } = {}) {
    const version = npm ?? npmVersion();
    const context = `npm pack --json (npm ${version})`;
    const advice =
        'Known shapes: an array (npm <= 11) or an object keyed by package name (npm >= 12). ' +
        `If npm has changed again, update scripts/npm-pack-json.mjs and the pin in ${PIN_LOCATION} together.`;
    let entries;
    try {
        entries = packEntries(stdout);
    } catch (error) {
        if (error instanceof PackJsonError) {
            throw new PackJsonError(`${context}: ${error.message}. ${advice}`);
        }
        throw error;
    }
    if (entries.length !== 1) {
        throw new PackJsonError(
            `${context}: it reported ${entries.length} tarballs and exactly one was expected - refusing to guess. ${advice}`
        );
    }
    return entries[0];
}

/** The filename of the one entry, or a refusal. */
export function soleTarballFilename(stdout, options) {
    return soleTarball(stdout, options).filename;
}

// ---------------------------------------------------------------------------
// As a program: stdin in, one filename out, exit 2 and one line when it cannot.
// ---------------------------------------------------------------------------

/**
 * Is this file the program, or is it being imported? Through realpath on both
 * sides - the gate learned that one the hard way, and a module that calls
 * process.exit() while being imported takes its importer with it.
 */
function invokedDirectly() {
    if (process.argv[1] === undefined) {
        return false;
    }
    const real = path => {
        try {
            return realpathSync(path);
        } catch {
            return path;
        }
    };
    return pathToFileURL(real(fileURLToPath(import.meta.url))).href === pathToFileURL(real(process.argv[1])).href;
}

async function readStdin() {
    let text = '';
    process.stdin.setEncoding('utf8');
    for await (const chunk of process.stdin) {
        text += chunk;
    }
    return text;
}

if (invokedDirectly()) {
    const stdout = await readStdin();
    try {
        process.stdout.write(`${soleTarballFilename(stdout)}\n`);
    } catch (error) {
        if (error instanceof PackJsonError) {
            process.stderr.write(`npm-pack-json: ${error.message}\n`);
            process.exit(2);
        }
        // Anything else is genuinely unexpected; still one line, still no stack.
        const text = (error instanceof Error ? error.message : String(error)).replace(/\s+/gu, ' ').trim();
        process.stderr.write(`npm-pack-json: could not read npm's output - ${text.slice(0, 200)}\n`);
        process.exit(2);
    }
}

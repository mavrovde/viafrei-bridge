/**
 * Resolve the external programs these scripts run to ABSOLUTE paths, instead
 * of letting the operating system search `$PATH` for them.
 *
 * WHY THIS EXISTS. Every script here ran `git`, `npm`, `tar` and `mkdir` by
 * bare name. That is a lookup through `$PATH`, so which program runs is decided
 * by the environment rather than by this repository — and one of these scripts
 * is the leak sweep that decides whether a commit may be published, while
 * another is the gate that reads the tarball about to be uploaded to the
 * registry. A gate whose implementation the caller can substitute is not a
 * gate. SonarCloud flagged seven of these call sites as `javascript:S4036` and
 * put the project's Security Rating on new code at B, which is the visible half
 * of the same fact. TWENTY sites were changed in all: the seven it named, plus
 * thirteen in the two self-tests, which it does not analyse. Leaving those would
 * have left the rule true of the code and false of the repository, and a rule
 * with a quiet exemption is the one nobody remembers when adding the next call.
 * (The first count said nineteen. It was taken with a single-line grep, which
 * cannot see `scripts/check-leaks.test.mjs:34`, where the program argument sits
 * on a line of its own — the same blind spot the sweep below is careful not to
 * have.)
 *
 * Two directories only: `/usr/bin` and `/bin`. Both are root-owned on macOS and
 * on the GitHub-hosted Linux runners, which are the two places these scripts
 * run. `/usr/local/bin` and `/opt/homebrew/bin` are deliberately NOT searched:
 * they are user-writable on a normal developer machine, so admitting them would
 * reinstate exactly the substitution this module exists to prevent. A tool that
 * is genuinely somewhere else makes this REFUSE, loudly, naming what it looked
 * for and where — a better failure than silently running something else.
 *
 * `node` and `npm` are a separate case and are NOT looked up here. Node's own
 * absolute path is `process.execPath`, which cannot be substituted, and npm is
 * a JavaScript file that node runs — so npm is invoked as
 * `process.execPath <npm-cli.js> …` and never as a program named "npm".
 */

import { accessSync, constants, realpathSync } from 'node:fs';
import { dirname, isAbsolute, join, sep } from 'node:path';

/** The only directories a tool may come from. Root-owned on both platforms. */
export const TOOL_DIRS = Object.freeze(['/usr/bin', '/bin']);

/** Raised when a tool is not in one of `TOOL_DIRS`, or was asked for wrongly. */
export class ToolError extends Error {
    constructor(message) {
        super(message);
        this.name = 'ToolError';
    }
}

const resolved = new Map();

/**
 * The absolute path of `name` in one of `TOOL_DIRS`.
 *
 * A name carrying a path separator is refused rather than passed through: the
 * point is that this module decides the location, so a caller handing over a
 * path — absolute or relative — is asking for the one thing that is not on
 * offer, and silently honouring it would make the promise above untrue for that
 * call site.
 */
export function resolveTool(name) {
    if (typeof name !== 'string' || name.length === 0) {
        throw new ToolError('resolveTool needs a non-empty tool name');
    }
    if (name.includes('/') || name.includes(sep) || name.includes('\\')) {
        throw new ToolError(`resolveTool takes a bare tool name, not a path: ${name}`);
    }
    const cached = resolved.get(name);
    if (cached !== undefined) return cached;
    for (const dir of TOOL_DIRS) {
        const candidate = join(dir, name);
        try {
            accessSync(candidate, constants.X_OK);
            resolved.set(name, candidate);
            return candidate;
        } catch {
            // Not here, or not executable by us. Try the next directory.
        }
    }
    throw new ToolError(
        `${name} is not an executable in any of ${TOOL_DIRS.join(', ')} — ` +
        'these scripts deliberately do not search $PATH. If your platform keeps ' +
        `${name} somewhere else, add that directory to TOOL_DIRS in ` +
        'scripts/tools.mjs as a deliberate decision, and read the comment at the ' +
        'top of that file first: the two directories are chosen because they are ' +
        'root-owned. Copying a tool into /usr/bin is not the answer and on macOS ' +
        'is not even possible'
    );
}

/**
 * The tail every real npm CLI path ends with, whatever the installation layout:
 * `node_modules/npm/bin/npm-cli.js`. Separators are normalised before comparing,
 * so a Windows-style value is judged by the same rule.
 */
const NPM_CLI_TAIL = ['node_modules', 'npm', 'bin', 'npm-cli.js'].join('/');

function looksLikeNpmCli(candidate) {
    return candidate.replace(/\\/gu, '/').endsWith(`/${NPM_CLI_TAIL}`);
}

/** Node's own absolute path. Not substitutable: the running process is it. */
export function nodePath() {
    return process.execPath;
}

/**
 * The absolute path of npm's CLI **JavaScript file**, to be run by `nodePath()`.
 *
 * Candidates are tried in order of how much they prove. `npm_execpath` is set
 * by npm itself when a script runs under it, so it is the best evidence
 * available — but it is an ENVIRONMENT VARIABLE, and the first draft accepted any
 * value that was absolute and ended in `.js`. That reversed this module's own
 * thesis for npm: the decider had simply moved from `$PATH` to a variable, and a
 * review demonstrated it by pointing the variable at a hand-written file, which
 * `check-tarball.mjs` would then have run as npm. It must therefore also be
 * SHAPED like npm's CLI — the exact tail `node_modules/npm/bin/npm-cli.js` — so a
 * stray or mistaken value cannot be honoured. The reach, stated the honest way:
 * **this stops accidents, not an attacker.** It is not a privilege barrier; it
 * removes the class of values that arrive by mistake.
 *
 * What that does NOT claim, because a security comment that overstates its reach
 * is worse than none: someone who can both set your environment and create a file
 * at `…/node_modules/npm/bin/npm-cli.js` can still be obeyed. Anyone able to do
 * both can usually substitute node itself, which is beyond anything this file can
 * reach. The narrowing is from "any writable path" to "a path that looks like a
 * real npm installation", and that is the whole of the claim.
 *
 * The rest are the layouts an npm that ships beside the running node
 * actually uses, and they are NOT interchangeable — measured, not assumed:
 * `../lib/node_modules/...` is the GitHub-hosted runner and nvm, while Homebrew
 * puts it under `../libexec/lib/node_modules/...`, which is why the first draft
 * of this function passed in CI and refused on a developer's Mac. Each base is
 * tried as given and again through `realpathSync`, because a node reached by
 * symlink resolves its siblings from the real location. Every candidate must
 * exist before it is returned, so this hands back a real file or refuses.
 */
export function npmCliPath() {
    const candidates = [];
    const fromEnv = process.env.npm_execpath;
    if (typeof fromEnv === 'string' && fromEnv.length > 0 && isAbsolute(fromEnv) && looksLikeNpmCli(fromEnv)) {
        candidates.push(fromEnv);
    }
    const bases = [dirname(process.execPath)];
    try {
        const real = dirname(realpathSync(process.execPath));
        if (!bases.includes(real)) bases.push(real);
    } catch {
        // Cannot resolve the symlink; the unresolved base is still a candidate.
    }
    for (const nodeDir of bases) {
        candidates.push(join(nodeDir, '..', 'lib', 'node_modules', 'npm', 'bin', 'npm-cli.js'));
        candidates.push(join(nodeDir, '..', 'libexec', 'lib', 'node_modules', 'npm', 'bin', 'npm-cli.js'));
        candidates.push(join(nodeDir, 'node_modules', 'npm', 'bin', 'npm-cli.js'));
    }
    for (const candidate of candidates) {
        try {
            accessSync(candidate, constants.R_OK);
            return candidate;
        } catch {
            // Next layout.
        }
    }
    throw new ToolError(
        "npm's CLI could not be located as a file next to " +
        `${process.execPath} — looked at ${candidates.length} layout(s). ` +
        'These scripts run npm as a script through node rather than as a ' +
        'program found on $PATH, so npm being on $PATH alone is not enough'
    );
}

#!/usr/bin/env node
import { realpathSync, writeSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { startBridge } from './bridge.js';
import { EXIT, type ExitCode, UsageError, helpText, parseOptions } from './config.js';
import { packageVersion } from './version.js';

/**
 * Both writers are synchronous on purpose: the next thing that happens is
 * usually `process.exit`, and a buffered write to a pipe is lost when it does.
 * A failure message that does not survive the exit is not a failure message.
 */

/** One line to stdout - `--help`, `--version`. Never protocol traffic. */
function out(line: string): void {
    try {
        writeSync(1, `${line}\n`);
    } catch {
        // stdout is closed. Nothing to be done about it here.
    }
}

/** One line to stderr. stdout belongs to the protocol; diagnostics go here. */
function say(line: string): void {
    try {
        writeSync(2, `${line}\n`);
    } catch {
        // stderr is closed. There is nowhere left to complain.
    }
}

export async function main(argv: readonly string[] = process.argv.slice(2)): Promise<void> {
    const version = packageVersion();

    let options;
    try {
        options = parseOptions(argv);
    } catch (error) {
        if (error instanceof UsageError) {
            say(`viafrei: ${error.message}`);
            process.exit(EXIT.USAGE);
        }
        throw error;
    }

    if (options.showHelp) {
        out(helpText(version));
        process.exit(EXIT.OK);
    }
    if (options.showVersion) {
        out(version);
        process.exit(EXIT.OK);
    }

    if (process.stdin.isTTY) {
        say(`viafrei ${version}: speaking MCP over stdio, relaying to ${options.url}. This is meant to be started by an MCP client; "viafrei --help" explains the options.`);
    }

    let stopping = false;
    const stop = (line: string, code: ExitCode): void => {
        if (stopping) {
            return;
        }
        stopping = true;
        if (line !== '') {
            say(line);
        }
        process.exit(code);
    };

    const handle = await startBridge(options, {
        warn: say,
        fatal: (line, code) => {
            stop(line, code);
        }
    });

    for (const signal of ['SIGINT', 'SIGTERM'] as const) {
        process.on(signal, () => {
            void handle.close().finally(() => {
                process.exit(EXIT.OK);
            });
        });
    }
}

/**
 * Was this file the program the user started, rather than something imported?
 *
 * The entry point is compared BOTH as given and resolved through symlinks,
 * because the only way anybody actually starts this package is the symlink npm
 * writes on install: `node_modules/.bin/viafrei -> ../viafrei/dist/cli.js`.
 * Node resolves a module's own URL through symlinks, so `argv[1]` is the link
 * while `import.meta.url` is its target; comparing only the unresolved form
 * made this false for every real invocation, and the process then loaded the
 * file, ran nothing and exited 0 in silence - which is what `npx viafrei` did.
 * Comparing only the resolved form is not enough either: under
 * `--preserve-symlinks-main` the module URL is the link, so both forms are
 * offered and a match on either is the answer.
 */
function isEntryPoint(): boolean {
    const entry = process.argv[1];
    if (entry === undefined) {
        return false;
    }
    const candidates = [pathToFileURL(entry).href];
    try {
        candidates.push(pathToFileURL(realpathSync(entry)).href);
    } catch {
        // The entry point cannot be resolved on disk; the form given is all there is.
    }
    return candidates.includes(import.meta.url);
}

const invokedDirectly = isEntryPoint();

if (invokedDirectly || process.env['VIAFREI_FORCE_CLI'] === '1') {
    main().catch((error: unknown) => {
        say(`viafrei: ${error instanceof Error ? error.message : String(error)}`);
        process.exit(EXIT.UNEXPECTED);
    });
}

/**
 * Configuration for the bridge: where it connects, with which headers, and how
 * long it waits. Every value has exactly one definition here, so the default
 * endpoint is never typed twice.
 */

/** The public ViaFrei MCP deployment. Written once. */
export const DEFAULT_MCP_ORIGIN = 'https://mcp.viafrei.de';

/** The MCP endpoint path. Streamable HTTP only; SSE is deprecated and absent. */
export const DEFAULT_MCP_PATH = '/mcp';

/** The endpoint the bridge talks to unless told otherwise. */
export const DEFAULT_MCP_URL = new URL(DEFAULT_MCP_PATH, DEFAULT_MCP_ORIGIN).toString();

/** Environment variable that overrides the endpoint. */
export const URL_ENV_VAR = 'VIAFREI_MCP_URL';

/** Environment variable that overrides the request timeout, in milliseconds. */
export const TIMEOUT_ENV_VAR = 'VIAFREI_MCP_TIMEOUT_MS';

/**
 * Environment variable that adds HTTP headers, for an API key an MCP client
 * cannot pass as a flag. Several headers are separated by a NEWLINE, because a
 * newline can never appear in a header name or value, so no value is
 * unrepresentable: a comma, a semicolon and a space all occur inside real header
 * values, and any of those as the separator would make something unsendable.
 */
export const HEADER_ENV_VAR = 'VIAFREI_MCP_HEADER';

/** The separator between headers in HEADER_ENV_VAR. See HEADER_ENV_VAR. */
export const HEADER_ENV_SEPARATOR = '\n';

/** Column width of the `Environment:` block in `helpText`. See its use there. */
const ENV_NAME_WIDTH = Math.max(URL_ENV_VAR.length, TIMEOUT_ENV_VAR.length, HEADER_ENV_VAR.length);

/** How long a single HTTP request may take before it is given up on. */
export const DEFAULT_TIMEOUT_MS = 30_000;

/**
 * Exit codes. They are part of the interface: a supervisor should be able to
 * tell "your network is down" from "you typed the flag wrong" without parsing
 * English.
 */
export const EXIT = {
    /** Clean shutdown: the client closed stdin. */
    OK: 0,
    /** Anything we did not anticipate. */
    UNEXPECTED: 1,
    /** Bad flag, bad value, bad URL. */
    USAGE: 2,
    /** The endpoint could not be reached at all (DNS, refused, timeout). */
    UNREACHABLE: 3,
    /** The endpoint answered, and the answer was a refusal (an HTTP status). */
    REFUSED: 4,
    /** The endpoint speaks a protocol version this client cannot use. */
    PROTOCOL: 5
} as const;

export type ExitCode = (typeof EXIT)[keyof typeof EXIT];

export interface Options {
    /** The endpoint to relay to. */
    url: string;
    /** Extra HTTP headers sent with every request (for example an API key). */
    headers: Record<string, string>;
    /** Per-request timeout in milliseconds. The event stream is not timed out. */
    timeoutMs: number;
    /** Print the version and exit. */
    showVersion: boolean;
    /** Print the help text and exit. */
    showHelp: boolean;
}

export class UsageError extends Error {}

/** Headers a caller may not set: they belong to the transport, not to the user. */
const RESERVED_HEADERS = new Set([
    'content-type',
    'accept',
    'mcp-session-id',
    'mcp-protocol-version',
    'content-length',
    'host'
]);

/**
 * `source` is what the reader typed — `--header` or the name of the environment
 * variable — because an error that names the wrong one sends them to the wrong
 * place to fix it.
 */
function parseHeader(raw: string, source = '--header'): [string, string] {
    const separator = raw.indexOf(':');
    if (separator < 1) {
        throw new UsageError(`${source} expects "Name: value", got ${JSON.stringify(raw)}`);
    }
    const name = raw.slice(0, separator).trim();
    const value = raw.slice(separator + 1).trim();
    if (name === '') {
        throw new UsageError(`${source} expects "Name: value", got ${JSON.stringify(raw)}`);
    }
    if (RESERVED_HEADERS.has(name.toLowerCase())) {
        throw new UsageError(`${source}: ${name} is set by the transport and cannot be overridden`);
    }
    return [name, value];
}

function parseTimeout(raw: string, source: string): number {
    const value = Number(raw);
    if (!Number.isFinite(value) || value <= 0) {
        throw new UsageError(`${source} expects a positive number of milliseconds, got ${JSON.stringify(raw)}`);
    }
    return Math.floor(value);
}

function validateUrl(raw: string, source: string): string {
    let parsed: URL;
    try {
        parsed = new URL(raw);
    } catch {
        throw new UsageError(`${source} is not a valid URL: ${JSON.stringify(raw)}`);
    }
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        throw new UsageError(`${source} must be http or https, got ${JSON.stringify(parsed.protocol)}`);
    }
    return parsed.toString();
}

/**
 * Parse argv (without `node` and the script) plus the environment.
 *
 * Precedence is the one people expect: a flag beats an environment variable,
 * an environment variable beats the built-in default.
 */
/**
 * Flags that take no value, and which boolean each one sets.
 *
 * A table rather than a chain of `===` comparisons, so an alias is a KEY: adding
 * `-?` is one line and cannot be added to one spelling and forgotten in another.
 * The risk a table carries is the opposite one - a key silently absent - so the
 * aliases are pinned in `config.test.ts` as equivalences to their long forms
 * rather than one case each. `-h` had no case at all before this table existed,
 * and deleting it from the old chain left the whole suite green.
 */
const BOOLEAN_FLAGS: ReadonlyMap<string, 'showHelp' | 'showVersion'> = new Map([
    ['--help', 'showHelp'],
    ['-h', 'showHelp'],
    ['--version', 'showVersion'],
    ['-V', 'showVersion']
]);

/**
 * A flag that takes a value, in either `--flag value` or `--flag=value` form.
 *
 * `names[0]` is the canonical spelling and is what an error message names, which
 * is the existing behaviour rather than a new decision: `parseHeader` already
 * defaulted its `source` to `--header`, so a reader who typed `-H` was already
 * told `--header`. Changing that here would have been a behaviour change smuggled
 * in under a refactor.
 *
 * The `=value` form is offered on `names[0]` ONLY, because that is what the chain
 * did: `--header=X: 1` is accepted and `-H=X: 1` is an unknown argument. Deriving
 * a prefix per alias is the obvious way to write this and would have newly
 * ACCEPTED the short form - a refactor that widens what a CLI takes is not a
 * refactor, so a case now pins the refusal.
 */
interface ValueFlag {
    readonly names: readonly [string, ...string[]];
    readonly apply: (options: Options, value: string, source: string) => void;
}

const VALUE_FLAGS: readonly ValueFlag[] = [
    {
        names: ['--url'],
        apply: (options, value, source) => {
            options.url = validateUrl(value, source);
        }
    },
    {
        names: ['--header', '-H'],
        apply: (options, value, source) => {
            const [name, headerValue] = parseHeader(value, source);
            options.headers[name] = headerValue;
        }
    },
    {
        names: ['--timeout'],
        apply: (options, value, source) => {
            options.timeoutMs = parseTimeout(value, source);
        }
    }
];

/**
 * The environment, applied before argv so that a flag beats a variable by
 * POSITION rather than by a rule — and so a `--header` of the same name
 * overwrites this one while a `--header` of a different name joins it.
 */
function applyEnvironment(options: Options, env: NodeJS.ProcessEnv): void {
    const url = env[URL_ENV_VAR]?.trim();
    if (url !== undefined && url !== '') {
        options.url = validateUrl(url, URL_ENV_VAR);
    }
    const timeout = env[TIMEOUT_ENV_VAR]?.trim();
    if (timeout !== undefined && timeout !== '') {
        options.timeoutMs = parseTimeout(timeout, TIMEOUT_ENV_VAR);
    }
    const headers = env[HEADER_ENV_VAR];
    if (headers === undefined || headers.trim() === '') {
        return;
    }
    for (const line of headers.split(HEADER_ENV_SEPARATOR)) {
        // A blank line is skipped rather than refused, so a trailing newline in
        // the variable is not an error.
        if (line.trim() !== '') {
            const [name, value] = parseHeader(line, HEADER_ENV_VAR);
            options.headers[name] = value;
        }
    }
}

/**
 * One argument. `readValue` consumes the NEXT argv entry and is called only for a
 * flag that needs it, so `--url` at the end of argv still refuses by the same
 * route it always did.
 */
function applyArgument(options: Options, argument: string, readValue: () => string): void {
    const booleanTarget = BOOLEAN_FLAGS.get(argument);
    if (booleanTarget !== undefined) {
        options[booleanTarget] = true;
        return;
    }
    for (const flag of VALUE_FLAGS) {
        const [canonical] = flag.names;
        if (flag.names.includes(argument)) {
            flag.apply(options, readValue(), canonical);
            return;
        }
        const inline = `${canonical}=`;
        if (argument.startsWith(inline)) {
            flag.apply(options, argument.slice(inline.length), canonical);
            return;
        }
    }
    throw new UsageError(`unknown argument ${JSON.stringify(argument)} - run "viafrei --help" for the list`);
}

export function parseOptions(argv: readonly string[], env: NodeJS.ProcessEnv = process.env): Options {
    const options: Options = {
        url: DEFAULT_MCP_URL,
        headers: {},
        timeoutMs: DEFAULT_TIMEOUT_MS,
        showVersion: false,
        showHelp: false
    };

    applyEnvironment(options, env);

    for (let index = 0; index < argv.length; index += 1) {
        const argument = argv[index] as string;
        applyArgument(options, argument, () => {
            const value = argv[index + 1];
            if (value === undefined || value.startsWith('--')) {
                throw new UsageError(`${argument} expects a value`);
            }
            index += 1;
            return value;
        });
    }

    return options;
}

export function helpText(version: string): string {
    return [
        `viafrei ${version} - stdio<->Streamable-HTTP bridge for the ViaFrei MCP server`,
        '',
        'Usage:',
        '  npx viafrei [options]',
        '',
        'The bridge speaks MCP over stdio to whatever started it and relays every',
        'message to a Streamable-HTTP MCP endpoint, in both directions. It holds no',
        'data, writes nothing outside the OS temp directory and sends no telemetry.',
        '',
        'Options:',
        `  --url <url>          endpoint to relay to (default ${DEFAULT_MCP_URL})`,
        '  --header "N: v"      extra HTTP header, repeatable (for an API key)',
        `  --timeout <ms>       per-request timeout (default ${DEFAULT_TIMEOUT_MS} ms)`,
        '  -V, --version        print the version and exit',
        '  -h, --help           print this text and exit',
        '',
        'Environment:',
        // Padded from the names rather than by hand: three variables went ragged
        // the first time this block was written, and the next one added would too.
        `  ${URL_ENV_VAR.padEnd(ENV_NAME_WIDTH)}  same as --url`,
        `  ${HEADER_ENV_VAR.padEnd(ENV_NAME_WIDTH)}  same as --header; separate several with a newline`,
        `  ${TIMEOUT_ENV_VAR.padEnd(ENV_NAME_WIDTH)}  same as --timeout`,
        '',
        'Exit codes:',
        `  ${EXIT.OK}  clean shutdown            ${EXIT.UNEXPECTED}  unexpected error`,
        `  ${EXIT.USAGE}  bad usage                 ${EXIT.UNREACHABLE}  endpoint unreachable`,
        `  ${EXIT.REFUSED}  endpoint refused          ${EXIT.PROTOCOL}  protocol version mismatch`,
        '',
        'Results carry an attribution line. Show it to the person reading the answer.',
        'Documentation: https://viafrei.de'
    ].join('\n');
}

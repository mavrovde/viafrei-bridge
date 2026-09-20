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

function parseHeader(raw: string): [string, string] {
    const separator = raw.indexOf(':');
    if (separator < 1) {
        throw new UsageError(`--header expects "Name: value", got ${JSON.stringify(raw)}`);
    }
    const name = raw.slice(0, separator).trim();
    const value = raw.slice(separator + 1).trim();
    if (name === '') {
        throw new UsageError(`--header expects "Name: value", got ${JSON.stringify(raw)}`);
    }
    if (RESERVED_HEADERS.has(name.toLowerCase())) {
        throw new UsageError(`--header ${name} is set by the transport and cannot be overridden`);
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
export function parseOptions(argv: readonly string[], env: NodeJS.ProcessEnv = process.env): Options {
    const options: Options = {
        url: DEFAULT_MCP_URL,
        headers: {},
        timeoutMs: DEFAULT_TIMEOUT_MS,
        showVersion: false,
        showHelp: false
    };

    const urlFromEnv = env[URL_ENV_VAR];
    if (urlFromEnv !== undefined && urlFromEnv.trim() !== '') {
        options.url = validateUrl(urlFromEnv.trim(), URL_ENV_VAR);
    }
    const timeoutFromEnv = env[TIMEOUT_ENV_VAR];
    if (timeoutFromEnv !== undefined && timeoutFromEnv.trim() !== '') {
        options.timeoutMs = parseTimeout(timeoutFromEnv.trim(), TIMEOUT_ENV_VAR);
    }

    for (let index = 0; index < argv.length; index += 1) {
        const argument = argv[index] as string;
        const next = (): string => {
            const value = argv[index + 1];
            if (value === undefined || value.startsWith('--')) {
                throw new UsageError(`${argument} expects a value`);
            }
            index += 1;
            return value;
        };

        if (argument === '--help' || argument === '-h') {
            options.showHelp = true;
        } else if (argument === '--version' || argument === '-V') {
            options.showVersion = true;
        } else if (argument === '--url') {
            options.url = validateUrl(next(), '--url');
        } else if (argument.startsWith('--url=')) {
            options.url = validateUrl(argument.slice('--url='.length), '--url');
        } else if (argument === '--header' || argument === '-H') {
            const [name, value] = parseHeader(next());
            options.headers[name] = value;
        } else if (argument.startsWith('--header=')) {
            const [name, value] = parseHeader(argument.slice('--header='.length));
            options.headers[name] = value;
        } else if (argument === '--timeout') {
            options.timeoutMs = parseTimeout(next(), '--timeout');
        } else if (argument.startsWith('--timeout=')) {
            options.timeoutMs = parseTimeout(argument.slice('--timeout='.length), '--timeout');
        } else {
            throw new UsageError(`unknown argument ${JSON.stringify(argument)} - run "viafrei --help" for the list`);
        }
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
        `  ${URL_ENV_VAR}      same as --url`,
        `  ${TIMEOUT_ENV_VAR}  same as --timeout`,
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

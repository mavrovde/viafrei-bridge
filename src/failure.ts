import { StreamableHTTPError } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { EXIT, type ExitCode } from './config.js';

/**
 * A transport failure, reduced to the one line a human needs and the exit code
 * a supervisor needs.
 *
 * The rule this file exists to keep: the user of an MCP client never sees a
 * stack trace from us. They see the URL we tried and what came back.
 */
export interface Failure {
    /** One line. No newlines, no stack, names the URL and what happened. */
    line: string;
    /** What the process should exit with if this failure is fatal. */
    exitCode: ExitCode;
    /** HTTP status, when the endpoint answered at all. */
    status?: number;
}

const STATUS_TEXT: Record<number, string> = {
    400: 'Bad Request',
    401: 'Unauthorized',
    403: 'Forbidden',
    404: 'Not Found',
    405: 'Method Not Allowed',
    406: 'Not Acceptable',
    408: 'Request Timeout',
    410: 'Gone',
    413: 'Payload Too Large',
    415: 'Unsupported Media Type',
    429: 'Too Many Requests',
    500: 'Internal Server Error',
    502: 'Bad Gateway',
    503: 'Service Unavailable',
    504: 'Gateway Timeout'
};

const SYSCALL_TEXT: Record<string, string> = {
    ECONNREFUSED: 'connection refused',
    ENOTFOUND: 'host not found (DNS)',
    EAI_AGAIN: 'DNS lookup failed',
    ECONNRESET: 'connection reset by peer',
    EHOSTUNREACH: 'host unreachable',
    ENETUNREACH: 'network unreachable',
    ETIMEDOUT: 'connection timed out',
    EPIPE: 'connection closed while writing',
    CERT_HAS_EXPIRED: 'the TLS certificate has expired',
    UNABLE_TO_VERIFY_LEAF_SIGNATURE: 'the TLS certificate could not be verified',
    DEPTH_ZERO_SELF_SIGNED_CERT: 'the TLS certificate is self-signed'
};

/** Collapse anything to a single readable line. */
function oneLine(text: string, limit = 200): string {
    const flattened = text.replace(/\s+/gu, ' ').trim();
    return flattened.length > limit ? `${flattened.slice(0, limit - 1)}…` : flattened;
}

function errorCode(error: unknown): string | undefined {
    let current: unknown = error;
    for (let depth = 0; depth < 5 && current !== null && typeof current === 'object'; depth += 1) {
        const code = (current as { code?: unknown }).code;
        if (typeof code === 'string') {
            return code;
        }
        current = (current as { cause?: unknown }).cause;
    }
    return undefined;
}

/** True when the failure is worth exactly one more attempt. */
export function isRetryable(error: unknown): boolean {
    if (error instanceof StreamableHTTPError) {
        return error.code === 502 || error.code === 503 || error.code === 504;
    }
    const code = errorCode(error);
    if (code === undefined) {
        return false;
    }
    return ['ECONNRESET', 'ETIMEDOUT', 'EAI_AGAIN', 'EPIPE', 'UND_ERR_SOCKET', 'UND_ERR_CONNECT_TIMEOUT'].includes(code);
}

/** Raised by the fetch wrapper when our own timeout fired. */
export class RequestTimeoutError extends Error {
    constructor(public readonly timeoutMs: number) {
        super(`no answer within ${timeoutMs} ms`);
        this.name = 'RequestTimeoutError';
    }
}

export type RedirectRefusal = 'cross-origin' | 'no-location' | 'too-many';

/**
 * Raised by the fetch wrapper when a redirect was not followed.
 *
 * Every request carries the caller's `--header` values. A redirect is the
 * server choosing where those go next, so the choice is made here instead: one
 * origin is one trust boundary, and crossing it is refused out loud rather than
 * followed quietly.
 */
export class RedirectRefusedError extends Error {
    public readonly reason: RedirectRefusal;
    public readonly from: string;
    public readonly to: string;
    public readonly httpStatus: number;

    constructor(detail: { reason: RedirectRefusal; from: string; to: string; status: number }) {
        super(`redirect not followed (${detail.reason})`);
        this.name = 'RedirectRefusedError';
        this.reason = detail.reason;
        this.from = detail.from;
        this.to = detail.to;
        this.httpStatus = detail.status;
    }
}

/**
 * Turn any thrown value into one line plus an exit code.
 *
 * Three outcomes, and the distinction is the point: the endpoint answered and
 * said no (REFUSED), the endpoint never answered (UNREACHABLE), or something
 * else entirely (UNEXPECTED).
 */
export function describeFailure(error: unknown, url: string): Failure {
    if (error instanceof RedirectRefusedError) {
        return { line: redirectLine(error), exitCode: EXIT.REFUSED };
    }

    if (error instanceof StreamableHTTPError && error.code !== undefined && error.code < 0) {
        // The SDK uses a negative code for "the endpoint answered, but not with
        // MCP" - a login page, an HTML error, a proxy's own 200. There is no
        // HTTP status here, so printing one (`HTTP -1 HTTP error`) invented a
        // fact, and "refused" was wrong twice over: it answered, and it did not
        // refuse.
        return {
            line: `viafrei: ${url} answered, but not with MCP - ${oneLine(stripSdkPrefix(error.message), 120)}. Is that the Streamable-HTTP endpoint (usually .../mcp), or is something in front of it answering instead?`,
            exitCode: EXIT.REFUSED
        };
    }

    if (error instanceof StreamableHTTPError && error.code !== undefined) {
        const status = error.code;
        const name = STATUS_TEXT[status] ?? 'HTTP error';
        const detail = extractServerDetail(error.message);
        const suffix = detail === undefined ? '' : ` - ${detail}`;
        return {
            line: `viafrei: ${url} refused the request: HTTP ${status} ${name}${suffix}`,
            exitCode: EXIT.REFUSED,
            status
        };
    }

    if (error instanceof RequestTimeoutError) {
        return {
            line: `viafrei: ${url} did not answer within ${error.timeoutMs} ms - the endpoint may be down, or --timeout is too short`,
            exitCode: EXIT.UNREACHABLE
        };
    }

    const code = errorCode(error);
    if (code !== undefined) {
        const explanation = SYSCALL_TEXT[code] ?? code;
        return {
            line: `viafrei: cannot reach ${url}: ${explanation} (${code}) - check the URL, or pass --url for a different endpoint`,
            exitCode: EXIT.UNREACHABLE
        };
    }

    const message = error instanceof Error ? error.message : String(error);
    if (/fetch failed|network|socket/iu.test(message)) {
        return {
            line: `viafrei: cannot reach ${url}: ${oneLine(message)}`,
            exitCode: EXIT.UNREACHABLE
        };
    }

    return {
        line: `viafrei: ${url}: ${oneLine(message)}`,
        exitCode: EXIT.UNEXPECTED
    };
}

/**
 * The SDK wraps the response body into the error message. Keep a short, single
 * line of it - it is often the only thing that says *why* - and drop the rest.
 */
function extractServerDetail(message: string): string | undefined {
    const marker = 'Error POSTing to endpoint:';
    const index = message.indexOf(marker);
    const body = index === -1 ? message : message.slice(index + marker.length);
    const trimmed = oneLine(body, 120);
    if (trimmed === '' || trimmed === 'null' || trimmed === 'undefined') {
        return undefined;
    }
    return trimmed;
}

/** One line for a redirect we chose not to follow, naming both ends. */
function redirectLine(error: RedirectRefusedError): string {
    if (error.reason === 'cross-origin') {
        return `viafrei: ${error.from} answered HTTP ${error.httpStatus} redirecting to ${error.to} - a different origin, and this request carries the headers you gave me, so I did not follow it. Point --url at the final endpoint if that redirect is expected.`;
    }
    if (error.reason === 'too-many') {
        return `viafrei: ${error.from} kept redirecting (more than 5 hops, last ${error.to}) - that is a loop, not an endpoint.`;
    }
    return `viafrei: ${error.from} answered HTTP ${error.httpStatus} - a redirect with no Location to follow.`;
}

/** The SDK prefixes its own message; the user does not need our plumbing. */
function stripSdkPrefix(message: string): string {
    return message.replace(/^Streamable HTTP error:\s*/u, '');
}

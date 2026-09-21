import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
    isJSONRPCErrorResponse,
    isJSONRPCRequest,
    isJSONRPCResultResponse,
    type JSONRPCMessage,
    type RequestId
} from '@modelcontextprotocol/sdk/types.js';
import { EXIT, type ExitCode, type Options } from './config.js';
import { createFetch } from './fetch.js';
import { describeFailure } from './failure.js';

/** JSON-RPC error code we return when the relay itself could not deliver. */
const RELAY_FAILED = -32011;

/**
 * How many failures in a row, with nothing succeeding in between, mean the
 * endpoint is gone rather than having a moment.
 *
 * An established session is allowed to wobble - a dropped event stream comes
 * back, a proxy restarts. It is not allowed to be dead for ever in silence:
 * this bridge is a child process of an MCP client, and a child that has stopped
 * working must exit so the client can say so, not sit there warning.
 */
const DEAD_AFTER_CONSECUTIVE_FAILURES = 3;

/** The SDK's own words for "I have stopped trying to reopen the stream". */
const GAVE_UP_RECONNECTING = /Maximum reconnection attempts/iu;

/** HTTP statuses that mean the session this bridge holds no longer exists. */
const SESSION_GONE = new Set([404, 410]);

export interface BridgeHooks {
    /** One line, no newline, for the human watching stderr. */
    warn: (line: string) => void;
    /** Called once when the bridge cannot continue. Never called twice. */
    fatal: (line: string, exitCode: ExitCode) => void;
}

export interface BridgeHandle {
    close: () => Promise<void>;
}

interface PendingInitialize {
    /** The protocol version the local client asked for. */
    requested: string | undefined;
}

function readProtocolVersion(value: unknown): string | undefined {
    if (value !== null && typeof value === 'object') {
        const version = (value as { protocolVersion?: unknown }).protocolVersion;
        if (typeof version === 'string') {
            return version;
        }
    }
    return undefined;
}

/**
 * Pull whatever the server said about versions out of an `initialize` error.
 * Servers differ; we look where they actually put it rather than insisting on
 * one shape and reporting nothing when it is a different one.
 */
function readSupportedVersions(data: unknown): string[] {
    if (data === null || typeof data !== 'object') {
        return [];
    }
    const record = data as Record<string, unknown>;
    const candidates = [record['supported'], record['supportedVersions'], record['supported_versions'], record['protocolVersion']];
    const versions: string[] = [];
    for (const candidate of candidates) {
        if (typeof candidate === 'string') {
            versions.push(candidate);
        } else if (Array.isArray(candidate)) {
            versions.push(...candidate.filter((entry): entry is string => typeof entry === 'string'));
        }
    }
    return [...new Set(versions)];
}

/**
 * Relay every JSON-RPC message between a local stdio client and a remote
 * Streamable-HTTP MCP endpoint, in both directions, unchanged.
 *
 * The bridge is deliberately a *message* relay and not a client/server pair
 * that re-implements the protocol: it never has an opinion about a method it
 * has not heard of, so a tool added on the server works here the same day
 * without a release. The only messages it looks inside are `initialize` and its
 * answer - because the session's protocol version has to end up on the HTTP
 * headers, and because a version the server cannot speak deserves a sentence
 * rather than a stack trace.
 */
export async function startBridge(options: Options, hooks: BridgeHooks): Promise<BridgeHandle> {
    const remote = new StreamableHTTPClientTransport(new URL(options.url), {
        fetch: createFetch(options.timeoutMs),
        requestInit: { headers: { ...options.headers } }
    });
    const input = process.stdin;
    const local = new StdioServerTransport(input, process.stdout);

    const pendingInitialize = new Map<RequestId, PendingInitialize>();
    let initialized = false;
    let closing = false;
    let finished = false;
    /**
     * The SDK transport calls `onerror` *and* rejects the `send()` promise for
     * the same failure, and `onerror` runs first. Counting the sends in flight
     * lets the rejection path own that failure - it is the only one that knows
     * which request failed and can answer the client - and leaves `onerror` for
     * the failures nothing is waiting on, such as the event stream dropping.
     */
    let sendsInFlight = 0;
    /** Reset by anything arriving from the endpoint; see the constant above. */
    let consecutiveFailures = 0;

    const finish = (line: string, exitCode: ExitCode): void => {
        if (finished) {
            return;
        }
        finished = true;
        hooks.fatal(line, exitCode);
    };

    const close = async (): Promise<void> => {
        if (closing) {
            return;
        }
        closing = true;
        await Promise.allSettled([remote.close(), local.close()]);
    };

    /** Tell the local client that a request could not be delivered. */
    const replyRelayFailure = async (id: RequestId, line: string): Promise<void> => {
        try {
            await local.send({ jsonrpc: '2.0', id, error: { code: RELAY_FAILED, message: line } });
        } catch {
            // The local client is gone; the shutdown path below handles it.
        }
    };

    // ---- local (stdio client) -> remote (Streamable HTTP) -------------------
    local.onmessage = (message: JSONRPCMessage): void => {
        const isInitialize = isJSONRPCRequest(message) && message.method === 'initialize';
        if (isInitialize && isJSONRPCRequest(message)) {
            pendingInitialize.set(message.id, { requested: readProtocolVersion(message.params) });
        }
        sendsInFlight += 1;
        void remote
            .send(message)
            .catch(async (error: unknown) => {
                const failure = describeFailure(error, options.url);
                if (isInitialize) {
                    // Nothing works from here, and the client is waiting on this
                    // one answer. Tell it, then say it once and stop.
                    if (isJSONRPCRequest(message)) {
                        await replyRelayFailure(message.id, failure.line);
                    }
                    finish(failure.line, failure.exitCode);
                    return;
                }
                hooks.warn(failure.line);
                if (isJSONRPCRequest(message)) {
                    await replyRelayFailure(message.id, failure.line);
                }
                if (failure.status !== undefined && SESSION_GONE.has(failure.status)) {
                    // The server has forgotten this session. Nothing sent from
                    // here can work again, and the client cannot re-initialize
                    // through a bridge that is still pretending.
                    finish(
                        `viafrei: ${options.url} no longer knows this session (HTTP ${failure.status}) - it expired or the server restarted; start the client's connection again`,
                        EXIT.REFUSED
                    );
                    return;
                }
                noteFailure(failure);
            })
            .finally(() => {
                sendsInFlight -= 1;
            });
    };

    // ---- remote (Streamable HTTP) -> local (stdio client) -------------------
    remote.onmessage = (message: JSONRPCMessage): void => {
        // The endpoint is alive: whatever went wrong before is over.
        consecutiveFailures = 0;
        const id = 'id' in message ? message.id : undefined;
        const pending = id === undefined ? undefined : pendingInitialize.get(id);
        let fatalAfterRelay: string | undefined;

        if (pending !== undefined && id !== undefined) {
            pendingInitialize.delete(id);
            if (isJSONRPCResultResponse(message)) {
                const served = readProtocolVersion(message.result);
                if (served !== undefined) {
                    remote.setProtocolVersion?.(served);
                    initialized = true;
                    if (pending.requested !== undefined && served !== pending.requested) {
                        hooks.warn(
                            `viafrei: ${options.url} speaks MCP protocol ${served}, this client asked for ${pending.requested}; relaying the server's answer unchanged`
                        );
                    }
                }
            } else if (isJSONRPCErrorResponse(message)) {
                const supported = readSupportedVersions(message.error.data);
                const spoken = supported.length > 0 ? `the server speaks ${supported.join(', ')}` : `the server did not say which versions it speaks`;
                fatalAfterRelay = `viafrei: ${options.url} rejected MCP protocol version ${pending.requested ?? '(unspecified)'}; ${spoken}`;
            }
        }

        void local.send(message).then(
            () => {
                if (fatalAfterRelay !== undefined) {
                    finish(fatalAfterRelay, EXIT.PROTOCOL);
                }
            },
            (error: unknown) => {
                hooks.warn(`viafrei: could not write to the local client: ${error instanceof Error ? error.message : String(error)}`);
            }
        );
    };

    /**
     * Count one failure the session survived - and stop if they stop stopping.
     *
     * Without this a permanently dead endpoint produced a warning per event and
     * nothing else, for ever: the documented exit 3 never came, and the client
     * kept a bridge that could not relay.
     */
    const noteFailure = (failure: { line: string; exitCode: ExitCode }): void => {
        consecutiveFailures += 1;
        if (consecutiveFailures >= DEAD_AFTER_CONSECUTIVE_FAILURES) {
            finish(
                `viafrei: ${options.url} has failed ${consecutiveFailures} times in a row with nothing succeeding in between - giving up. Last failure: ${failure.line.replace(/^viafrei: /u, '')}`,
                failure.exitCode
            );
        }
    };

    remote.onerror = (error: Error): void => {
        if (closing || sendsInFlight > 0) {
            return;
        }
        const failure = describeFailure(error, options.url);
        if (!initialized) {
            finish(failure.line, failure.exitCode);
            return;
        }
        if (GAVE_UP_RECONNECTING.test(error.message)) {
            // The SDK has run out of reconnection attempts. The session is up on
            // paper and dead in fact; say which, once, and exit.
            finish(
                `viafrei: lost the event stream from ${options.url} and could not reopen it - the endpoint is not answering any more`,
                EXIT.UNREACHABLE
            );
            return;
        }
        // The session is up; a stream can drop and come back. Say so once per
        // event, keep relaying - but keep count.
        hooks.warn(failure.line);
        noteFailure(failure);
    };

    remote.onclose = (): void => {
        if (closing) {
            return;
        }
        finish(`viafrei: ${options.url} closed the session`, EXIT.UNREACHABLE);
    };

    local.onerror = (error: Error): void => {
        hooks.warn(`viafrei: local stdio error: ${error.message}`);
    };

    local.onclose = (): void => {
        if (closing) {
            return;
        }
        finish('', EXIT.OK);
    };

    /**
     * Closing stdin is how an MCP client says goodbye, and the transport does
     * not watch for it. Without this the bridge outlives its client: the
     * standalone event stream keeps the event loop alive and the process hangs
     * around holding a session open on the server.
     */
    input.once('end', () => {
        void close().finally(() => {
            finish('', EXIT.OK);
        });
    });

    await remote.start();
    await local.start();

    return { close };
}

import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { fileURLToPath } from 'node:url';

/** The built CLI, the artefact users actually run. Tests exercise that, not `src/`. */
export const CLI_PATH = fileURLToPath(new URL('../../dist/cli.js', import.meta.url));

/** Children still running. Killed on the way out, whatever the test did. */
const survivors = new Set<ChildProcessWithoutNullStreams>();
process.on('exit', () => {
    for (const child of survivors) {
        child.kill('SIGKILL');
    }
});

export interface RawBridge {
    child: ChildProcessWithoutNullStreams;
    /** Everything written to stderr so far. */
    stderr: () => string;
    /** Everything written to stdout so far. */
    stdout: () => string;
    /** Send one JSON-RPC message on stdin. */
    send: (message: unknown) => void;
    /** Resolves with the exit code (or -1 for a signal). */
    exited: Promise<number>;
    /** Stop it, whatever state it is in. */
    kill: () => void;
}

/** The slice of node:test's context this module needs. */
export interface Cleanup {
    after: (fn: () => void) => void;
}

/**
 * Start the CLI and talk to it with raw JSON-RPC lines.
 *
 * Used where the SDK client would get in the way - the failure and
 * protocol-mismatch cases, where the point is what the *process* prints and
 * what it exits with.
 */
export function spawnBridge(
    args: readonly string[],
    env: NodeJS.ProcessEnv = {},
    cleanup?: Cleanup,
    /** The path to start it by. Defaults to the built file; pass a symlink to it to test how npm installs it. */
    entryPoint: string = CLI_PATH
): RawBridge {
    const child = spawn(process.execPath, [entryPoint, ...args], {
        env: { ...process.env, ...env },
        stdio: ['pipe', 'pipe', 'pipe']
    }) as ChildProcessWithoutNullStreams;

    let stderrText = '';
    let stdoutText = '';
    child.stderr.setEncoding('utf8');
    child.stdout.setEncoding('utf8');
    child.stderr.on('data', (chunk: string) => {
        stderrText += chunk;
    });
    child.stdout.on('data', (chunk: string) => {
        stdoutText += chunk;
    });

    const exited = new Promise<number>(resolve => {
        child.on('exit', code => {
            resolve(code ?? -1);
        });
    });

    // A test that fails should not also leave a process behind: an orphan bridge
    // holds its stdio pipes open and the test file's own process never exits,
    // which turns a failing assertion into a hanging CI job.
    survivors.add(child);
    void exited.then(() => survivors.delete(child));
    const kill = (): void => {
        if (child.exitCode === null && child.signalCode === null) {
            child.kill('SIGKILL');
        }
    };
    // Registered per test, not only at process exit: an orphan bridge holds its
    // stdio pipes open, so the test file's process never exits and never fires
    // `exit` either. Without this, one failing assertion becomes a hung CI job
    // instead of a red test - which is how this was found.
    cleanup?.after(kill);

    return {
        kill,
        child,
        stderr: () => stderrText,
        stdout: () => stdoutText,
        send: (message: unknown) => {
            child.stdin.write(`${JSON.stringify(message)}\n`);
        },
        exited
    };
}

/** A JSON-RPC `initialize` request, as any MCP client would send it. */
export function initializeRequest(id = 1): unknown {
    return {
        jsonrpc: '2.0',
        id,
        method: 'initialize',
        params: {
            protocolVersion: '2025-06-18',
            capabilities: {},
            clientInfo: { name: 'test-client', version: '0.0.0' }
        }
    };
}

/** Wait for a condition, polling. Returns false if it never became true. */
export async function waitFor(predicate: () => boolean, timeoutMs = 5_000): Promise<boolean> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        if (predicate()) {
            return true;
        }
        await new Promise<void>(resolve => setTimeout(resolve, 20));
    }
    return predicate();
}

/** A TCP port with nothing behind it: bound, then released. */
export async function closedPort(): Promise<number> {
    const { createServer } = await import('node:net');
    const server = createServer();
    await new Promise<void>(resolve => {
        server.listen(0, '127.0.0.1', resolve);
    });
    const address = server.address();
    const port = typeof address === 'object' && address !== null ? address.port : 0;
    await new Promise<void>(resolve => {
        server.close(() => {
            resolve();
        });
    });
    return port;
}

/** Only the lines the bridge itself wrote. */
export function stderrLines(text: string): string[] {
    return text
        .split('\n')
        .map(line => line.trim())
        .filter(line => line !== '');
}

/** A plain HTTP server the test controls completely, on loopback. */
export interface RawServer {
    url: string;
    origin: string;
    port: number;
    /** Every request it received: method, path, and the headers it was given. */
    seen: { method: string; path: string; headers: Record<string, string | string[] | undefined> }[];
    close: () => Promise<void>;
}

/**
 * Start a hand-written HTTP endpoint.
 *
 * The SDK stub server in `stub-server.ts` is the right tool for "does the relay
 * relay". This is the right tool for "what does the bridge do when the endpoint
 * misbehaves" - a truncated body, a redirect, a socket that goes away - none of
 * which a well-behaved server will do for you.
 */
export async function startRawServer(
    handler: (request: import('node:http').IncomingMessage, response: import('node:http').ServerResponse) => void,
    cleanup?: Cleanup
): Promise<RawServer> {
    const { createServer } = await import('node:http');
    const seen: RawServer['seen'] = [];
    const server = createServer((request, response) => {
        seen.push({ method: request.method ?? '', path: request.url ?? '', headers: { ...request.headers } });
        handler(request, response);
    });
    await new Promise<void>(resolve => {
        server.listen(0, '127.0.0.1', resolve);
    });
    const address = server.address();
    const port = typeof address === 'object' && address !== null ? address.port : 0;
    const close = async (): Promise<void> => {
        await new Promise<void>(resolve => {
            server.close(() => {
                resolve();
            });
            server.closeAllConnections();
        });
    };
    cleanup?.after(() => {
        void close();
    });
    return { url: `http://127.0.0.1:${port}/mcp`, origin: `http://127.0.0.1:${port}`, port, seen, close };
}

/** Read a request body to the end. */
export async function readBody(request: import('node:http').IncomingMessage): Promise<string> {
    const chunks: Buffer[] = [];
    for await (const chunk of request) {
        chunks.push(Buffer.from(chunk as Buffer));
    }
    return Buffer.concat(chunks).toString('utf8');
}

/** The answer a minimal, well-behaved endpoint gives to `initialize`. */
export function initializeResult(id: unknown, protocolVersion = '2025-06-18'): string {
    return JSON.stringify({
        jsonrpc: '2.0',
        id,
        result: {
            protocolVersion,
            capabilities: { tools: {} },
            serverInfo: { name: 'raw-fake', version: '0.0.0' }
        }
    });
}

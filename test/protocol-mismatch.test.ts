import assert from 'node:assert/strict';
import { createServer, type Server as HttpServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { describe, it } from 'node:test';
import { initializeRequest, spawnBridge, stderrLines, waitFor } from './helpers.js';

/**
 * A stub that answers `initialize` with whatever we hand it, so the two
 * version-mismatch shapes can be produced on demand. The SDK's own server
 * negotiates successfully by design and therefore cannot produce them.
 */
async function startRigidServer(
    answer: (id: unknown) => unknown,
    onRequest?: (headers: Record<string, string | string[] | undefined>) => void
): Promise<{ url: string; close: () => Promise<void> }> {
    const server: HttpServer = createServer((request, response) => {
        const chunks: Buffer[] = [];
        request.on('data', chunk => chunks.push(chunk as Buffer));
        request.on('end', () => {
            onRequest?.(request.headers);
            let id: unknown = null;
            try {
                id = (JSON.parse(Buffer.concat(chunks).toString('utf8')) as { id?: unknown }).id ?? null;
            } catch {
                id = null;
            }
            response.writeHead(200, { 'content-type': 'application/json', 'mcp-session-id': 'stub-session' });
            response.end(JSON.stringify(answer(id)));
        });
    });
    await new Promise<void>(resolve => {
        server.listen(0, '127.0.0.1', resolve);
    });
    const { port } = server.address() as AddressInfo;
    return {
        url: `http://127.0.0.1:${port}/mcp`,
        close: async () =>
            new Promise<void>(resolve => {
                server.close(() => {
                    resolve();
                });
                server.closeAllConnections();
            })
    };
}

describe('protocol version mismatch', () => {
    it('says which version the server speaks when it negotiates down, and keeps relaying', async t => {
        const stub = await startRigidServer(id => ({
            jsonrpc: '2.0',
            id,
            result: {
                protocolVersion: '2024-11-05',
                capabilities: {},
                serverInfo: { name: 'rigid', version: '0.0.0' }
            }
        }));
        try {
            const bridge = spawnBridge(['--url', stub.url], {}, t);
            bridge.send(initializeRequest());

            const said = await waitFor(() => bridge.stderr().includes('2024-11-05'));
            assert.ok(said, `nothing was said about the version; stderr: ${bridge.stderr()}`);
            const line = stderrLines(bridge.stderr())[0] ?? '';
            assert.ok(line.includes('2024-11-05'), 'the line does not name the version the server speaks');
            assert.ok(line.includes('2025-06-18'), 'the line does not name the version the client asked for');
            assert.ok(line.includes(stub.url));

            // The answer still reached the client unchanged - we warn, we do not
            // intercept. stderr and stdout are separate pipes with no ordering
            // between them, so wait for the answer rather than assuming the
            // warning implies it.
            assert.ok(
                await waitFor(() => bridge.stdout().includes('protocolVersion')),
                `the initialize answer never reached the client; stdout: ${bridge.stdout()}`
            );
            const relayed = JSON.parse(bridge.stdout().trim().split('\n')[0] ?? '{}') as {
                result?: { protocolVersion?: string };
            };
            assert.equal(relayed.result?.protocolVersion, '2024-11-05');

            bridge.child.stdin.end();
            assert.equal(await bridge.exited, 0);
        } finally {
            await stub.close();
        }
    });

    // The `spoken` else-branch. Deleting its wording left all 82 tests green:
    // every rejection fixture carried a `supported` list, so half of that sentence
    // was unreachable by the suite. Measured before the function was refactored,
    // because a branch nothing reaches is a branch a refactor may quietly drop.
    it('says the server did not name its versions when the rejection carries none', async t => {
        const stub = await startRigidServer(id => ({
            jsonrpc: '2.0',
            id,
            error: { code: -32602, message: 'Unsupported protocol version' }
        }));
        try {
            const bridge = spawnBridge(['--url', stub.url], {}, t);
            bridge.send(initializeRequest());

            const code = await bridge.exited;
            const lines = stderrLines(bridge.stderr());
            assert.equal(code, 5, `expected exit 5, got ${code}; stderr: ${bridge.stderr()}`);
            assert.equal(lines.length, 1, `expected exactly one line, got:\n${bridge.stderr()}`);
            assert.ok(
                lines[0]?.includes('did not say which versions it speaks'),
                `the line does not say the server named none: ${lines[0]}`
            );
            assert.ok(lines[0]?.includes('2025-06-18'), `the line does not name the rejected version: ${lines[0]}`);
        } finally {
            await stub.close();
        }
    });

    // `setProtocolVersion` on the negotiated answer. Deleting that call ALSO left
    // 82 tests green, and it is the more dangerous of the two holes: the warning
    // still printed, so the suite looked like it covered the negotiate-down path
    // while asserting only that we complain about it. This asserts what the bridge
    // SENDS afterwards, which is the only place the call is observable.
    it('sends the negotiated version on the next request, not the one it asked for', async t => {
        const versionHeaders: string[] = [];
        const stub = await startRigidServer(
            id => ({
                jsonrpc: '2.0',
                id,
                result: {
                    protocolVersion: '2024-11-05',
                    capabilities: {},
                    serverInfo: { name: 'rigid', version: '0.0.0' }
                }
            }),
            headers => {
                versionHeaders.push(String(headers['mcp-protocol-version'] ?? '(absent)'));
            }
        );
        try {
            const bridge = spawnBridge(['--url', stub.url], {}, t);
            bridge.send(initializeRequest());
            assert.ok(
                await waitFor(() => bridge.stdout().includes('protocolVersion')),
                `the initialize answer never came back; stdout: ${bridge.stdout()}`
            );

            bridge.send({ jsonrpc: '2.0', id: 2, method: 'ping' });
            assert.ok(
                await waitFor(() => versionHeaders.length >= 2),
                `the second request never arrived; headers seen: ${JSON.stringify(versionHeaders)}`
            );
            assert.equal(
                versionHeaders[1],
                '2024-11-05',
                `the request after the handshake did not carry the negotiated version; seen: ${JSON.stringify(versionHeaders)}`
            );
        } finally {
            await stub.close();
        }
    });

    it('names the supported versions and exits 5 when the server rejects the version', async t => {
        const stub = await startRigidServer(id => ({
            jsonrpc: '2.0',
            id,
            error: {
                code: -32602,
                message: 'Unsupported protocol version',
                data: { supported: ['2025-03-26', '2024-11-05'], requested: '2025-06-18' }
            }
        }));
        try {
            const bridge = spawnBridge(['--url', stub.url], {}, t);
            bridge.send(initializeRequest());

            const code = await bridge.exited;
            const lines = stderrLines(bridge.stderr());
            assert.equal(code, 5, `expected exit 5, got ${code}; stderr: ${bridge.stderr()}`);
            assert.equal(lines.length, 1, `expected exactly one line, got:\n${bridge.stderr()}`);
            assert.ok(lines[0]?.includes('2025-03-26, 2024-11-05'), `the line does not list the server's versions: ${lines[0]}`);
            assert.ok(lines[0]?.includes('2025-06-18'), `the line does not name the rejected version: ${lines[0]}`);

            // The client got the error too, so it can report something useful.
            const relayed = JSON.parse(bridge.stdout().trim().split('\n')[0] ?? '{}') as { error?: { message?: string } };
            assert.equal(relayed.error?.message, 'Unsupported protocol version');
        } finally {
            await stub.close();
        }
    });
});

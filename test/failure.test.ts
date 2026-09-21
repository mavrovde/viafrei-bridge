import assert from 'node:assert/strict';
import { createServer, type Server as HttpServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { describe, it } from 'node:test';
import { closedPort, initializeRequest, spawnBridge, stderrLines } from './helpers.js';

/** A stack trace has frames. This is what one looks like in output. */
function looksLikeAStackTrace(text: string): boolean {
    return /^\s+at\s/mu.test(text) || text.includes('node:internal/');
}

describe('honest failure', () => {
    it('prints one line and exits 3 when the endpoint is unreachable', async t => {
        const port = await closedPort();
        const url = `http://127.0.0.1:${port}/mcp`;
        const bridge = spawnBridge(['--url', url], {}, t);
        bridge.send(initializeRequest());

        const code = await bridge.exited;
        const lines = stderrLines(bridge.stderr());

        assert.equal(code, 3, `expected exit 3, got ${code}; stderr: ${bridge.stderr()}`);
        assert.equal(lines.length, 1, `expected exactly one line, got:\n${bridge.stderr()}`);
        assert.ok(lines[0]?.includes(url), `the line does not name the URL: ${lines[0]}`);
        assert.match(lines[0] ?? '', /connection refused|ECONNREFUSED/u);
        // The advice half of the line is load-bearing and nothing else pinned it:
        // it used to say "pass --url for a different endpoint", which reads as
        // though another ViaFrei could be reached at another address. There is
        // one, it is hosted, and --url is for a proxy in front of it.
        assert.match(
            lines[0] ?? '',
            /check your network connection; --url only if you relay through a proxy$/u,
            `the advice half of the line has drifted: ${lines[0]}`
        );
        assert.ok(
            !/for a different endpoint/u.test(lines[0] ?? ''),
            `the line offers an endpoint that does not exist: ${lines[0]}`
        );
        assert.ok(!looksLikeAStackTrace(bridge.stderr()), 'a stack trace reached the user');
    });

    it('prints one line naming the status and exits 4 when the endpoint refuses', async t => {
        const server: HttpServer = createServer((_request, response) => {
            response.writeHead(403, { 'content-type': 'text/plain' });
            response.end('origin not allowed');
        });
        await new Promise<void>(resolve => {
            server.listen(0, '127.0.0.1', resolve);
        });
        const { port } = server.address() as AddressInfo;
        const url = `http://127.0.0.1:${port}/mcp`;

        try {
            const bridge = spawnBridge(['--url', url], {}, t);
            bridge.send(initializeRequest());

            const code = await bridge.exited;
            const lines = stderrLines(bridge.stderr());

            assert.equal(code, 4, `expected exit 4, got ${code}; stderr: ${bridge.stderr()}`);
            assert.equal(lines.length, 1, `expected exactly one line, got:\n${bridge.stderr()}`);
            assert.ok(lines[0]?.includes(url), `the line does not name the URL: ${lines[0]}`);
            assert.ok(lines[0]?.includes('403'), `the line does not name the status: ${lines[0]}`);
            assert.ok(lines[0]?.includes('Forbidden'));
            assert.ok(!looksLikeAStackTrace(bridge.stderr()), 'a stack trace reached the user');
        } finally {
            await new Promise<void>(resolve => {
                server.close(() => {
                    resolve();
                });
                server.closeAllConnections();
            });
        }
    });

    it('also tells the client, so the call fails rather than hangs', async t => {
        const port = await closedPort();
        const bridge = spawnBridge(['--url', `http://127.0.0.1:${port}/mcp`], {}, t);
        bridge.send(initializeRequest(7));
        await bridge.exited;

        const answer: unknown = JSON.parse(bridge.stdout().trim().split('\n')[0] ?? '{}');
        const message = answer as { id?: number; error?: { message?: string } };
        assert.equal(message.id, 7);
        assert.match(message.error?.message ?? '', /cannot reach http:\/\/127\.0\.0\.1:/u);
    });

    it('rejects a bad --url before opening anything', async t => {
        const bridge = spawnBridge(['--url', 'ftp://example.invalid/mcp'], {}, t);
        const code = await bridge.exited;
        assert.equal(code, 2);
        assert.equal(stderrLines(bridge.stderr()).length, 1);
        assert.match(bridge.stderr(), /must be http or https/u);
    });

    it('rejects a header that belongs to the transport', async t => {
        const bridge = spawnBridge(['--header', 'mcp-session-id: forged'], {}, t);
        const code = await bridge.exited;
        assert.equal(code, 2);
        assert.match(bridge.stderr(), /set by the transport/u);
    });
});

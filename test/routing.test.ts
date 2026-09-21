import assert from 'node:assert/strict';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { describe, it } from 'node:test';
import { initializeRequest, initializeResult, readBody, spawnBridge, startRawServer, stderrLines, waitFor } from './helpers.js';

/**
 * What the bridge does when the endpoint misbehaves.
 *
 * Every case here is a route: one condition in, one exit code and one line out.
 * The routing was hand-probed in review and found correct - and nothing pinned
 * it, so any of it could have changed silently. These are the pins.
 *
 * Three rules are asserted in every case, because they are the contract a
 * supervising MCP client relies on:
 *
 *   - the exit code says what kind of failure it was (3 nobody answered,
 *     4 the endpoint answered and this cannot continue, 1 something else),
 *   - stderr is ONE line, and it names the endpoint,
 *   - no stack frame ever reaches the user.
 */

/** A stack trace has frames. This is what one looks like in output. */
function looksLikeAStackTrace(text: string): boolean {
    return /^\s+at\s/mu.test(text) || text.includes('node:internal/');
}

function assertOneHonestLine(stderr: string, url: string): string {
    const lines = stderrLines(stderr);
    assert.equal(lines.length, 1, `expected exactly one line, got:\n${stderr}`);
    assert.ok(!looksLikeAStackTrace(stderr), `a stack trace reached the user:\n${stderr}`);
    const line = lines[0] ?? '';
    assert.ok(line.includes(url) || line.includes(new URL(url).origin), `the line does not name the endpoint: ${line}`);
    return line;
}

/** A minimal endpoint that answers `initialize` and then does as it is told. */
async function endpointThatInitializes(
    afterInitialize: (request: IncomingMessage, response: ServerResponse, body: string) => void,
    cleanup: { after: (fn: () => void) => void }
) {
    return startRawServer((request, response) => {
        if (request.method === 'GET') {
            // 405 is how a server says "no standalone event stream here", which
            // keeps these tests about the case under test.
            response.writeHead(405).end();
            return;
        }
        void readBody(request).then(body => {
            const message = JSON.parse(body === '' ? '{}' : body) as { id?: unknown; method?: string };
            if (message.method === 'initialize') {
                response.writeHead(200, { 'content-type': 'application/json' });
                response.end(initializeResult(message.id));
                return;
            }
            if (message.id === undefined) {
                response.writeHead(202).end();
                return;
            }
            afterInitialize(request, response, body);
        });
    }, cleanup);
}

describe('failure routing', () => {
    it('exits 4 and says it is not MCP when a 200 comes back as something else', async t => {
        const server = await startRawServer((_request, response) => {
            response.writeHead(200, { 'content-type': 'text/html' });
            response.end('<html><body>please log in</body></html>');
        }, t);

        const bridge = spawnBridge(['--url', server.url], {}, t);
        bridge.send(initializeRequest());
        const code = await bridge.exited;

        assert.equal(code, 4, `expected exit 4, got ${code}; stderr: ${bridge.stderr()}`);
        const line = assertOneHonestLine(bridge.stderr(), server.url);
        assert.match(line, /answered, but not with MCP/u);
        assert.match(line, /text\/html/u);
        // The old wording invented an HTTP status that never existed and called
        // an answer a refusal. Neither may come back.
        assert.ok(!line.includes('HTTP -1'), `an invented status reached the user: ${line}`);
        assert.ok(!/refused the request/u.test(line), `an answer was reported as a refusal: ${line}`);
    });

    it('exits 1 when the endpoint sends JSON it never finishes', async t => {
        const server = await startRawServer((_request, response) => {
            response.writeHead(200, { 'content-type': 'application/json' });
            response.end('{"jsonrpc":"2.0","id":1,"result":{"protocolVersion":');
        }, t);

        const bridge = spawnBridge(['--url', server.url], {}, t);
        bridge.send(initializeRequest());
        const code = await bridge.exited;

        assert.equal(code, 1, `expected exit 1, got ${code}; stderr: ${bridge.stderr()}`);
        assertOneHonestLine(bridge.stderr(), server.url);
    });

    it('exits 3 when the socket goes away in the middle of the answer', async t => {
        const server = await startRawServer((_request, response) => {
            response.writeHead(200, { 'content-type': 'application/json' });
            response.write('{"jsonrpc":"2.0",');
            response.socket?.destroy();
        }, t);

        const bridge = spawnBridge(['--url', server.url], {}, t);
        bridge.send(initializeRequest());
        const code = await bridge.exited;

        assert.equal(code, 3, `expected exit 3, got ${code}; stderr: ${bridge.stderr()}`);
        assertOneHonestLine(bridge.stderr(), server.url);
    });

    it('exits 4 and says to reconnect when the server has forgotten the session', async t => {
        const server = await endpointThatInitializes((_request, response) => {
            response.writeHead(404, { 'content-type': 'text/plain' });
            response.end('Session not found');
        }, t);

        const bridge = spawnBridge(['--url', server.url], {}, t);
        bridge.send(initializeRequest());
        await waitFor(() => bridge.stdout().includes('"result"'));
        bridge.send({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} });
        const code = await bridge.exited;

        assert.equal(code, 4, `expected exit 4, got ${code}; stderr: ${bridge.stderr()}`);
        assert.match(bridge.stderr(), /no longer knows this session/u);
        assert.ok(!looksLikeAStackTrace(bridge.stderr()), 'a stack trace reached the user');
        // The waiting call is answered too, so the client fails rather than hangs.
        assert.match(bridge.stdout(), /"id":2[^\n]*"error"/u);
    });

    it('exits 3 naming the timeout and the flag when the endpoint never answers', async t => {
        const server = await startRawServer(() => {
            // Deliberately no answer, ever.
        }, t);

        const bridge = spawnBridge(['--url', server.url, '--timeout', '400'], {}, t);
        bridge.send(initializeRequest());
        const code = await bridge.exited;

        assert.equal(code, 3, `expected exit 3, got ${code}; stderr: ${bridge.stderr()}`);
        const line = assertOneHonestLine(bridge.stderr(), server.url);
        assert.match(line, /400 ms/u);
        assert.match(line, /--timeout/u);
    });

    it('warns once about a malformed line on stdin and keeps the session', async t => {
        const server = await endpointThatInitializes((_request, response) => {
            response.writeHead(200, { 'content-type': 'application/json' });
            response.end(JSON.stringify({ jsonrpc: '2.0', id: 2, result: { tools: [] } }));
        }, t);

        const bridge = spawnBridge(['--url', server.url], {}, t);
        bridge.child.stdin.write('this is not JSON\n');
        assert.ok(await waitFor(() => bridge.stderr().includes('local stdio error')), `no warning appeared: ${bridge.stderr()}`);

        bridge.send(initializeRequest());
        assert.ok(
            await waitFor(() => bridge.stdout().includes('raw-fake')),
            `the session did not survive the malformed line: ${bridge.stdout()} / ${bridge.stderr()}`
        );

        assert.equal(stderrLines(bridge.stderr()).length, 1, `expected exactly one warning, got:\n${bridge.stderr()}`);
        assert.ok(!looksLikeAStackTrace(bridge.stderr()), 'a stack trace reached the user');
        assert.equal(bridge.child.exitCode, null, 'the bridge exited over one bad line');
    });

    for (const signal of ['SIGINT', 'SIGTERM'] as const) {
        it(`exits 0 quietly on ${signal}`, async t => {
            const server = await endpointThatInitializes((_request, response) => {
                response.writeHead(202).end();
            }, t);

            const bridge = spawnBridge(['--url', server.url], {}, t);
            bridge.send(initializeRequest());
            await waitFor(() => bridge.stdout().includes('raw-fake'));

            bridge.child.kill(signal);
            const code = await bridge.exited;

            assert.equal(code, 0, `expected exit 0, got ${code}; stderr: ${bridge.stderr()}`);
            assert.equal(stderrLines(bridge.stderr()).length, 0, `${signal} should be silent, got:\n${bridge.stderr()}`);
        });
    }

    it('exits 0 when the client closes stdin, and does not sit there holding the session', async t => {
        const server = await endpointThatInitializes((_request, response) => {
            response.writeHead(202).end();
        }, t);

        const bridge = spawnBridge(['--url', server.url], {}, t);
        bridge.send(initializeRequest());
        await waitFor(() => bridge.stdout().includes('raw-fake'));

        // Closing stdin is how an MCP client says goodbye. Before this was
        // handled, the bridge outlived its client: the test hung for the full
        // timeout instead of failing.
        bridge.child.stdin.end();
        const code = await Promise.race([
            bridge.exited,
            new Promise<number>(resolve => {
                setTimeout(() => resolve(-2), 5_000);
            })
        ]);

        assert.notEqual(code, -2, 'the bridge outlived its client after stdin closed');
        assert.equal(code, 0, `expected exit 0, got ${code}; stderr: ${bridge.stderr()}`);
        assert.equal(stderrLines(bridge.stderr()).length, 0, `goodbye should be silent, got:\n${bridge.stderr()}`);
    });

    it('gives up instead of warning for ever when the endpoint stays broken', async t => {
        const server = await endpointThatInitializes((_request, response) => {
            response.writeHead(500, { 'content-type': 'text/plain' });
            response.end('nope');
        }, t);

        const bridge = spawnBridge(['--url', server.url], {}, t);
        bridge.send(initializeRequest());
        await waitFor(() => bridge.stdout().includes('raw-fake'));

        for (const id of [2, 3, 4]) {
            bridge.send({ jsonrpc: '2.0', id, method: 'tools/list', params: {} });
            await waitFor(() => bridge.stdout().includes(`"id":${id}`));
        }

        const code = await Promise.race([
            bridge.exited,
            new Promise<number>(resolve => {
                setTimeout(() => resolve(-2), 10_000);
            })
        ]);

        assert.notEqual(code, -2, 'a permanently dead endpoint never terminated the bridge');
        assert.equal(code, 4, `expected exit 4, got ${code}; stderr: ${bridge.stderr()}`);
        assert.match(bridge.stderr(), /times in a row with nothing succeeding in between - giving up/u);
        assert.ok(!looksLikeAStackTrace(bridge.stderr()), 'a stack trace reached the user');
    });
});

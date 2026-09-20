import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { initializeRequest, initializeResult, readBody, spawnBridge, startRawServer, stderrLines, waitFor } from './helpers.js';

/**
 * Where a `--header` is allowed to travel.
 *
 * Every request the bridge makes carries the headers the user passed on the
 * command line - that is how an API key reaches the server. A redirect is the
 * server naming the next address for those headers, so the bridge decides
 * instead of `fetch`: same origin is followed, a different origin is refused
 * out loud.
 *
 * `fetch` drops `Authorization` across origins and nothing else, so a key sent
 * as `X-Api-Key` - which is how most MCP endpoints take one - used to arrive at
 * whatever the `Location` said. That is what these two tests hold shut.
 */
describe('redirects and where headers may travel', () => {
    it('follows a same-origin redirect, with the headers, and the session works', async t => {
        const server = await startRawServer((request, response) => {
            const path = request.url ?? '';
            if (request.method === 'GET') {
                response.writeHead(405).end();
                return;
            }
            if (path === '/mcp') {
                response.writeHead(307, { location: '/mcp/v1' });
                response.end();
                return;
            }
            void readBody(request).then(body => {
                const message = JSON.parse(body === '' ? '{}' : body) as { id?: unknown; method?: string };
                if (message.method === 'initialize') {
                    response.writeHead(200, { 'content-type': 'application/json' });
                    response.end(initializeResult(message.id));
                    return;
                }
                response.writeHead(202).end();
            });
        }, t);

        const bridge = spawnBridge(['--url', server.url, '--header', 'x-api-key: SECRET-FOR-THIS-ORIGIN'], {}, t);
        bridge.send(initializeRequest());

        assert.ok(await waitFor(() => bridge.stdout().includes('raw-fake')), `the redirect was not followed: ${bridge.stderr()}`);
        const redirected = server.seen.filter(entry => entry.path === '/mcp/v1');
        assert.ok(redirected.length > 0, 'the second hop never happened');
        assert.equal(redirected[0]?.headers['x-api-key'], 'SECRET-FOR-THIS-ORIGIN', 'the header did not survive the same-origin hop');
        assert.equal(stderrLines(bridge.stderr()).length, 0, `a followed redirect should be silent, got:\n${bridge.stderr()}`);
    });

    it('refuses a cross-origin redirect and sends the header nowhere', async t => {
        const elsewhere = await startRawServer((_request, response) => {
            response.writeHead(200, { 'content-type': 'application/json' });
            response.end(initializeResult(1));
        }, t);

        const server = await startRawServer((request, response) => {
            if (request.method === 'GET') {
                response.writeHead(405).end();
                return;
            }
            response.writeHead(307, { location: `${elsewhere.origin}/mcp` });
            response.end();
        }, t);

        const bridge = spawnBridge(['--url', server.url, '--header', 'x-api-key: SUPER-SECRET-KEY'], {}, t);
        bridge.send(initializeRequest());
        const code = await bridge.exited;

        assert.equal(code, 4, `expected exit 4, got ${code}; stderr: ${bridge.stderr()}`);
        const lines = stderrLines(bridge.stderr());
        assert.equal(lines.length, 1, `expected exactly one line, got:\n${bridge.stderr()}`);
        const line = lines[0] ?? '';
        assert.ok(line.includes(server.origin), `the line does not name where it was: ${line}`);
        assert.ok(line.includes(elsewhere.origin), `the line does not name where it was sent: ${line}`);
        assert.match(line, /did not follow it/u);

        // The whole point: the other origin never saw the request, so it never
        // saw the key - and the key is not in our own output either.
        assert.deepEqual(elsewhere.seen, [], 'the request reached the other origin');
        assert.ok(!bridge.stderr().includes('SUPER-SECRET-KEY'), 'the key was printed');
        assert.ok(!bridge.stdout().includes('SUPER-SECRET-KEY'), 'the key was relayed to the client');
    });
});

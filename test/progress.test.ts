import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { initializeRequest, spawnBridge, waitFor } from './helpers.js';
import { startStubServer, type StubServer } from './stub-server.js';

/**
 * Progress is asserted on the wire rather than through an SDK client.
 *
 * The SDK client dispatches notification handlers in a microtask but resolves a
 * response synchronously, so when a progress notification and the final result
 * arrive in the same pipe chunk the client can drop the last progress event.
 * That race belongs to any stdio MCP server, not to this bridge - and a test
 * that asserted through it would be asserting the client's scheduling. What the
 * bridge owes is: every message, unchanged, in order. That is what is checked.
 */
describe('progress relaying', () => {
    let stub: StubServer;

    before(async () => {
        stub = await startStubServer();
    });

    after(async () => {
        await stub.close();
    });

    it('relays every progress notification, in order, with the token untouched', async t => {
        const bridge = spawnBridge(['--url', stub.url], {}, t);
        bridge.send(initializeRequest(1));
        assert.ok(await waitFor(() => bridge.stdout().includes('"id":1')), 'no initialize answer');

        bridge.send({ jsonrpc: '2.0', method: 'notifications/initialized' });
        bridge.send({
            jsonrpc: '2.0',
            id: 2,
            method: 'tools/call',
            params: { name: 'stub_with_progress', arguments: {}, _meta: { progressToken: 'tok-42' } }
        });

        const received = (): unknown[] =>
            bridge
                .stdout()
                .split('\n')
                .filter(line => line.trim() !== '')
                .map(line => JSON.parse(line) as unknown);

        assert.ok(
            await waitFor(() => received().some(message => (message as { id?: unknown }).id === 2)),
            `the tool call never came back; stdout:\n${bridge.stdout()}`
        );

        const messages = received();
        const progress = messages.filter(message => (message as { method?: string }).method === 'notifications/progress') as {
            params: { progressToken: unknown; progress: number };
        }[];

        assert.equal(progress.length, 2, `expected two progress notifications, saw ${progress.length}`);
        assert.deepEqual(
            progress.map(message => message.params.progress),
            [1, 2]
        );
        assert.ok(
            progress.every(message => message.params.progressToken === 'tok-42'),
            'the progress token was rewritten on the way through'
        );

        // Order matters: progress before the result it belongs to.
        const resultIndex = messages.findIndex(message => (message as { id?: unknown }).id === 2);
        const lastProgressIndex = messages.reduce<number>(
            (last, message, index) => ((message as { method?: string }).method === 'notifications/progress' ? index : last),
            -1
        );
        assert.ok(lastProgressIndex < resultIndex, 'a progress notification arrived after the result');

        bridge.child.stdin.end();
        assert.equal(await bridge.exited, 0);
    });
});

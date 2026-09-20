import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import {
    ListRootsRequestSchema,
    LoggingMessageNotificationSchema,
    type CallToolResult,
    type ReadResourceResult
} from '@modelcontextprotocol/sdk/types.js';
import { CLI_PATH, waitFor } from './helpers.js';
import { startStubServer, type StubServer } from './stub-server.js';

/**
 * End to end, through the built CLI, against a local stub MCP server.
 *
 * Nothing here touches the public endpoint or any provider: the stub is started
 * by the test and dies with it.
 */
describe('relay through the built CLI', () => {
    let stub: StubServer;
    let client: Client;
    let transport: StdioClientTransport;
    const logNotifications: string[] = [];

    before(async () => {
        stub = await startStubServer();
        transport = new StdioClientTransport({
            command: process.execPath,
            args: [CLI_PATH, '--url', stub.url, '--header', 'X-Test-Header: present'],
            stderr: 'pipe'
        });
        client = new Client({ name: 'relay-test', version: '0.0.0' }, { capabilities: { roots: { listChanged: true } } });
        client.setRequestHandler(ListRootsRequestSchema, async () => ({
            roots: [{ uri: 'file:///workspace', name: 'workspace' }]
        }));
        client.setNotificationHandler(LoggingMessageNotificationSchema, async notification => {
            logNotifications.push(String(notification.params.data));
        });
        await client.connect(transport);
    });

    after(async () => {
        await client.close().catch(() => undefined);
        await stub.close();
    });

    it('relays initialize and reports the stub as the server', () => {
        const info = client.getServerVersion();
        assert.equal(info?.name, 'viafrei-stub');
        assert.deepEqual(client.getServerCapabilities()?.tools, {});
    });

    it('relays tools/list unchanged', async () => {
        const { tools } = await client.listTools();
        const names = tools.map(tool => tool.name).sort();
        assert.deepEqual(names, [
            'stub_ask_client_for_roots',
            'stub_echo',
            'stub_emit_notification',
            'stub_observed',
            'stub_with_progress'
        ]);
        const echo = tools.find(tool => tool.name === 'stub_echo');
        assert.equal(echo?.description, 'Echo a word back, with a structured result and an attribution line.');
        assert.deepEqual(echo?.inputSchema.required, ['word']);
    });

    it('relays tools/call with its structured result and _meta', async () => {
        const result = (await client.callTool({ name: 'stub_echo', arguments: { word: 'Stau' } })) as CallToolResult;
        assert.equal(result.content[0]?.type, 'text');
        assert.equal((result.content[0] as { text: string }).text, 'echo: Stau');
        assert.deepEqual(result.structuredContent, { word: 'Stau', length: 4 });
        assert.equal(result._meta?.['attribution'], 'Stub data, no provider involved.');
    });

    it('relays a resource read', async () => {
        const { resources } = await client.listResources();
        assert.equal(resources[0]?.uri, 'stub://greeting');
        const read = (await client.readResource({ uri: 'stub://greeting' })) as ReadResourceResult;
        assert.equal((read.contents[0] as { text?: string } | undefined)?.text, 'hello from the stub');
    });

    it('relays a client notification to the server', async () => {
        await client.sendRootsListChanged();
        const arrived = await waitFor(() =>
            stub.notificationsFromClient.some(notification => notification.method === 'notifications/roots/list_changed')
        );
        assert.ok(arrived, 'the stub never saw notifications/roots/list_changed');

        // ...and the stub can say so through a tool call, which proves the round trip.
        const result = (await client.callTool({ name: 'stub_observed' })) as CallToolResult;
        const methods = (result.structuredContent as { methods: string[] }).methods;
        assert.ok(methods.includes('notifications/roots/list_changed'), `observed: ${methods.join(', ')}`);
    });

    it('relays a server notification to the client on the standalone stream', async () => {
        await client.callTool({ name: 'stub_emit_notification' });
        const arrived = await waitFor(() => logNotifications.includes('stub-notification'));
        assert.ok(arrived, `the client never saw the logging notification; saw: ${logNotifications.join(', ')}`);
    });

    it('relays a server-to-client request and its answer', async () => {
        const result = (await client.callTool({ name: 'stub_ask_client_for_roots' })) as CallToolResult;
        assert.equal((result.content[0] as { text: string }).text, 'roots: workspace');
        assert.deepEqual(result.structuredContent, { roots: ['file:///workspace'] });
    });

    it('sends --header on every request and never echoes it back to the client', async () => {
        assert.ok(stub.headersSeen.length > 0);
        assert.ok(
            stub.headersSeen.every(headers => headers['x-test-header'] === 'present'),
            'a request arrived without the --header value'
        );
    });

});

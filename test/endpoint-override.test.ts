import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { CLI_PATH } from './helpers.js';
import { startStubServer, type StubServer } from './stub-server.js';

/**
 * The endpoint is configurable, and a self-hoster must be able to set it
 * without editing a file. Both routes are asserted, because a default that can
 * only be changed one way is a default nobody can change.
 */
describe('endpoint override', () => {
    let stub: StubServer;

    before(async () => {
        stub = await startStubServer();
    });

    after(async () => {
        await stub.close();
    });

    const connectWith = async (args: string[], env: Record<string, string>): Promise<Client> => {
        const transport = new StdioClientTransport({
            command: process.execPath,
            args: [CLI_PATH, ...args],
            env: { ...(process.env as Record<string, string>), ...env },
            stderr: 'pipe'
        });
        const client = new Client({ name: 'override-test', version: '0.0.0' });
        await client.connect(transport);
        return client;
    };

    it('VIAFREI_MCP_URL points the bridge at another endpoint', async () => {
        const client = await connectWith([], { VIAFREI_MCP_URL: stub.url });
        try {
            assert.equal(client.getServerVersion()?.name, 'viafrei-stub');
        } finally {
            await client.close();
        }
    });

    it('--url wins over VIAFREI_MCP_URL', async () => {
        const client = await connectWith(['--url', stub.url], { VIAFREI_MCP_URL: 'http://127.0.0.1:1/nowhere' });
        try {
            assert.equal(client.getServerVersion()?.name, 'viafrei-stub');
        } finally {
            await client.close();
        }
    });
});

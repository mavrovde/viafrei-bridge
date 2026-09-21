import { randomUUID } from 'node:crypto';
import { createServer, type IncomingMessage, type Server as HttpServer, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import {
    CallToolRequestSchema,
    ListResourcesRequestSchema,
    ListToolsRequestSchema,
    ReadResourceRequestSchema,
    isInitializeRequest,
    type Notification
} from '@modelcontextprotocol/sdk/types.js';

/**
 * A local Streamable-HTTP MCP server for the tests to talk to.
 *
 * It exists so that no test ever contacts the public endpoint or a provider.
 * It is a real MCP server built on the SDK rather than a hand-rolled fake, so
 * "the bridge relayed it" means the protocol actually worked, not that two
 * strings matched.
 */
export interface StubServer {
    url: string;
    /** Every notification the stub received from the client, newest last. */
    notificationsFromClient: Notification[];
    /** Every `Authorization`-style header seen, for the `--header` test. */
    headersSeen: Record<string, string>[];
    close: () => Promise<void>;
}

export async function startStubServer(): Promise<StubServer> {
    const notificationsFromClient: Notification[] = [];
    const headersSeen: Record<string, string>[] = [];
    const transports = new Map<string, StreamableHTTPServerTransport>();

    const makeServer = (): Server => {
        const server = new Server(
            { name: 'viafrei-stub', version: '0.0.0-test' },
            { capabilities: { tools: {}, resources: {}, logging: {} } }
        );

        server.fallbackNotificationHandler = async (notification: Notification): Promise<void> => {
            notificationsFromClient.push(notification);
        };

        server.setRequestHandler(ListToolsRequestSchema, async () => ({
            tools: [
                {
                    name: 'stub_echo',
                    description: 'Echo a word back, with a structured result and an attribution line.',
                    inputSchema: {
                        type: 'object',
                        properties: { word: { type: 'string', description: 'The word to echo.' } },
                        required: ['word'],
                        additionalProperties: false
                    }
                },
                {
                    name: 'stub_observed',
                    description: 'Report what the stub has seen arrive from the client.',
                    inputSchema: { type: 'object', properties: {}, additionalProperties: false }
                },
                {
                    name: 'stub_ask_client_for_roots',
                    description: 'Send a roots/list request back to the client and report the answer.',
                    inputSchema: { type: 'object', properties: {}, additionalProperties: false }
                },
                {
                    name: 'stub_emit_notification',
                    description: 'Emit a logging notification on the standalone event stream.',
                    inputSchema: { type: 'object', properties: {}, additionalProperties: false }
                },
                {
                    name: 'stub_with_progress',
                    description: 'Report progress twice before answering.',
                    inputSchema: { type: 'object', properties: {}, additionalProperties: false }
                }
            ]
        }));

        server.setRequestHandler(CallToolRequestSchema, async (request, extra) => {
            const name = request.params.name;
            if (name === 'stub_with_progress') {
                const progressToken = request.params._meta?.progressToken;
                if (progressToken !== undefined) {
                    for (const progress of [1, 2]) {
                        await extra.sendNotification({
                            method: 'notifications/progress',
                            params: { progressToken, progress, total: 2, message: `step ${progress}` }
                        });
                    }
                }
                return { content: [{ type: 'text' as const, text: 'done' }] };
            }
            if (name === 'stub_echo') {
                const word = String((request.params.arguments as { word?: unknown } | undefined)?.word ?? '');
                return {
                    content: [{ type: 'text' as const, text: `echo: ${word}` }],
                    structuredContent: { word, length: word.length },
                    _meta: { attribution: 'Stub data, no provider involved.' }
                };
            }
            if (name === 'stub_observed') {
                return {
                    content: [{ type: 'text' as const, text: `notifications: ${notificationsFromClient.length}` }],
                    structuredContent: { methods: notificationsFromClient.map(entry => entry.method) }
                };
            }
            if (name === 'stub_ask_client_for_roots') {
                const roots = await server.listRoots();
                return {
                    content: [{ type: 'text' as const, text: `roots: ${roots.roots.map(root => root.name ?? root.uri).join(', ')}` }],
                    structuredContent: { roots: roots.roots.map(root => root.uri) }
                };
            }
            if (name === 'stub_emit_notification') {
                await server.sendLoggingMessage({ level: 'info', data: 'stub-notification' });
                return { content: [{ type: 'text' as const, text: 'sent' }] };
            }
            return { content: [{ type: 'text' as const, text: `no such tool: ${name}` }], isError: true };
        });

        server.setRequestHandler(ListResourcesRequestSchema, async () => ({
            resources: [{ uri: 'stub://greeting', name: 'greeting', mimeType: 'text/plain' }]
        }));

        server.setRequestHandler(ReadResourceRequestSchema, async request => ({
            contents: [{ uri: request.params.uri, mimeType: 'text/plain', text: 'hello from the stub' }]
        }));

        return server;
    };

    const httpServer: HttpServer = createServer((request: IncomingMessage, response: ServerResponse) => {
        void (async () => {
            const headers: Record<string, string> = {};
            for (const [key, value] of Object.entries(request.headers)) {
                headers[key] = Array.isArray(value) ? value.join(', ') : (value ?? '');
            }
            headersSeen.push(headers);

            const sessionId = request.headers['mcp-session-id'];
            const existing = typeof sessionId === 'string' ? transports.get(sessionId) : undefined;

            if (existing !== undefined) {
                await existing.handleRequest(request, response, await readBody(request));
                return;
            }

            const body = request.method === 'POST' ? await readBody(request) : undefined;
            if (request.method === 'POST' && isInitializeRequest(body)) {
                const transport = new StreamableHTTPServerTransport({
                    sessionIdGenerator: () => randomUUID(),
                    onsessioninitialized: id => {
                        transports.set(id, transport);
                    }
                });
                transport.onclose = (): void => {
                    if (transport.sessionId !== undefined) {
                        transports.delete(transport.sessionId);
                    }
                };
                await makeServer().connect(transport);
                await transport.handleRequest(request, response, body);
                return;
            }

            response.writeHead(400, { 'content-type': 'application/json' });
            response.end(JSON.stringify({ jsonrpc: '2.0', error: { code: -32000, message: 'no session' }, id: null }));
        })().catch(() => {
            if (!response.headersSent) {
                response.writeHead(500);
            }
            response.end();
        });
    });

    await new Promise<void>(resolve => {
        httpServer.listen(0, '127.0.0.1', resolve);
    });
    const { port } = httpServer.address() as AddressInfo;

    return {
        url: `http://127.0.0.1:${port}/mcp`,
        notificationsFromClient,
        headersSeen,
        close: async (): Promise<void> => {
            for (const transport of transports.values()) {
                await transport.close().catch(() => undefined);
            }
            await new Promise<void>(resolve => {
                httpServer.close(() => {
                    resolve();
                });
                httpServer.closeAllConnections();
            });
        }
    };
}

async function readBody(request: IncomingMessage): Promise<unknown> {
    const chunks: Buffer[] = [];
    for await (const chunk of request) {
        chunks.push(chunk as Buffer);
    }
    if (chunks.length === 0) {
        return undefined;
    }
    try {
        return JSON.parse(Buffer.concat(chunks).toString('utf8'));
    } catch {
        return undefined;
    }
}

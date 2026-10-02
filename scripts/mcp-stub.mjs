/**
 * A stub MCP endpoint for the self-tests, answering from the real snapshot.
 *
 * WHY THIS IS A MODULE. `probe-catalogue.test.mjs` built this stub inline. The second
 * self-test that needed a server with the real surface — `propose-release.test.mjs`,
 * which drives the catalogue probe as a child process — would have carried a copy, and
 * the repository has already paid for that shape once: eleven duplicated lines in two
 * self-tests failed a pull request on SonarCloud's duplication limit, and the fix was
 * `fixture-root.mjs`. So the stub lives here once and each test imports it.
 *
 * The stub runs in the HOST process; the scripts under test reach it over loopback and
 * never import it. A fixture that copies every non-test script (`propose-release.test.mjs`
 * does) carries a copy of this file too, where it is dead weight rather than a dependency.
 */

import { createServer } from 'node:http';

/**
 * A stub MCP endpoint answering from `answers` (a map of JSON-RPC method → `{ result }`
 * or `{ error }`). A method with no entry is answered with a JSON-RPC error, so a probe
 * asking something the stub does not know fails visibly rather than hanging.
 */
export async function startStub(answers) {
    const server = createServer((request, response) => {
        const chunks = [];
        request.on('data', chunk => chunks.push(chunk));
        request.on('end', () => {
            if (request.method === 'DELETE') {
                response.writeHead(200).end();
                return;
            }
            let method = '';
            try {
                method = JSON.parse(Buffer.concat(chunks).toString('utf8')).method ?? '';
            } catch {
                method = '';
            }
            if (method === 'notifications/initialized') {
                response.writeHead(202).end();
                return;
            }
            const result = answers[method];
            const payload = result === undefined
                ? { jsonrpc: '2.0', id: 1, error: { code: -32601, message: `no stub for ${method}` } }
                : { jsonrpc: '2.0', id: 1, ...result };
            response.writeHead(200, { 'content-type': 'application/json', 'mcp-session-id': 'stub-session' });
            response.end(JSON.stringify(payload));
        });
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const { port } = server.address();
    return {
        url: `http://127.0.0.1:${port}/mcp`,
        close: () => new Promise(resolve => {
            server.closeAllConnections();
            server.close(() => resolve());
        })
    };
}

/**
 * The snapshot stores a long `pattern` as `patternLength`; a server sends the text.
 * This puts the text back, so the probe's own substitution has something to fire on.
 */
export function unnormalise(value) {
    if (Array.isArray(value)) return value.map(unnormalise);
    if (value === null || typeof value !== 'object') return value;
    const out = {};
    for (const [key, inner] of Object.entries(value)) {
        if (key === 'patternLength' && typeof inner === 'number') {
            out.pattern = 'x'.repeat(inner);
            continue;
        }
        out[key] = unnormalise(inner);
    }
    return out;
}

/**
 * Default answers: the real surface as a SERVER would send it, not as the snapshot
 * stores it. Two things are therefore put back, and both matter:
 *
 *   - `$schema` on every tool, which the snapshot drops on purpose;
 *   - the long `pattern` TEXT wherever the snapshot holds a `patternLength` stand-in.
 *
 * Without the second, the probe's substitution never fires and its own precondition
 * refuses the capture — correctly. The first draft of this stub replayed the normalised
 * schemas and every case failed on that refusal, which is the precondition working
 * rather than the probe being broken.
 *
 * `real` is the parsed snapshot; `overrides` replaces whole methods.
 */
export function liveAnswers(real, overrides = {}) {
    const tools = real.tools.map(tool => ({
        ...unnormalise(tool),
        // A STAND-IN, not the real draft URI. The real one names a host, and
        // catalogue.json's own $comment records that the host is dropped so it never
        // reaches this repository's allow-list — putting it in a fixture would do the
        // thing the snapshot avoids. The probe only cares that the key is present and
        // gets removed, so its value is irrelevant to every assertion here.
        inputSchema: { $schema: 'a-schema-dialect-uri', ...unnormalise(tool.inputSchema) }
    }));
    return {
        initialize: {
            result: {
                protocolVersion: real.protocolVersion,
                capabilities: real.capabilities,
                serverInfo: real.serverInfo,
                instructions: real.instructions
            }
        },
        'tools/list': { result: { tools } },
        'resources/list': { result: { resources: real.resources } },
        'resources/templates/list': { result: { resourceTemplates: real.resourceTemplates } },
        'prompts/list': { result: { prompts: real.prompts } },
        ...overrides
    };
}

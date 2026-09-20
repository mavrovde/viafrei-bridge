import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { StreamableHTTPError } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { DEFAULT_MCP_URL, DEFAULT_TIMEOUT_MS, EXIT, UsageError, helpText, parseOptions } from '../src/config.js';
import { RequestTimeoutError, describeFailure, isRetryable } from '../src/failure.js';

describe('parseOptions', () => {
    it('defaults to the public endpoint', () => {
        const options = parseOptions([], {});
        assert.equal(options.url, 'https://mcp.viafrei.de/mcp');
        assert.equal(options.url, DEFAULT_MCP_URL);
        assert.equal(options.timeoutMs, DEFAULT_TIMEOUT_MS);
        assert.deepEqual(options.headers, {});
    });

    it('takes the endpoint from the environment', () => {
        const options = parseOptions([], { VIAFREI_MCP_URL: 'http://127.0.0.1:8787/mcp' });
        assert.equal(options.url, 'http://127.0.0.1:8787/mcp');
    });

    it('lets --url win over the environment', () => {
        const options = parseOptions(['--url', 'http://127.0.0.1:9/mcp'], { VIAFREI_MCP_URL: 'http://127.0.0.1:8787/mcp' });
        assert.equal(options.url, 'http://127.0.0.1:9/mcp');
    });

    it('accepts --url=value as well as --url value', () => {
        assert.equal(parseOptions(['--url=http://127.0.0.1:9/mcp'], {}).url, 'http://127.0.0.1:9/mcp');
    });

    it('collects repeated headers', () => {
        const options = parseOptions(['--header', 'Authorization: Bearer x', '-H', 'X-Trace: 1'], {});
        assert.deepEqual(options.headers, { Authorization: 'Bearer x', 'X-Trace': '1' });
    });

    it('refuses a header that belongs to the transport', () => {
        assert.throws(() => parseOptions(['--header', 'Mcp-Session-Id: forged'], {}), UsageError);
    });

    it('refuses a header without a colon', () => {
        assert.throws(() => parseOptions(['--header', 'Authorization'], {}), UsageError);
    });

    it('refuses a non-http URL, an unparseable URL and a bad timeout', () => {
        assert.throws(() => parseOptions(['--url', 'ftp://x/y'], {}), UsageError);
        assert.throws(() => parseOptions(['--url', 'not a url'], {}), UsageError);
        assert.throws(() => parseOptions(['--timeout', '0'], {}), UsageError);
        assert.throws(() => parseOptions(['--timeout', 'soon'], {}), UsageError);
        assert.throws(() => parseOptions([], { VIAFREI_MCP_TIMEOUT_MS: '-1' }), UsageError);
    });

    it('refuses an unknown argument instead of ignoring it', () => {
        assert.throws(() => parseOptions(['--telemetry'], {}), UsageError);
    });

    it('refuses a flag whose value is missing', () => {
        assert.throws(() => parseOptions(['--url'], {}), UsageError);
        assert.throws(() => parseOptions(['--url', '--header'], {}), UsageError);
    });

    it('handles --help and --version', () => {
        assert.equal(parseOptions(['--help'], {}).showHelp, true);
        assert.equal(parseOptions(['-V'], {}).showVersion, true);
    });
});

describe('helpText', () => {
    it('names the default endpoint and every flag exactly once', () => {
        const text = helpText('9.9.9');
        assert.ok(text.includes(DEFAULT_MCP_URL));
        for (const flag of ['--url', '--header', '--timeout', '--version', '--help', 'VIAFREI_MCP_URL']) {
            assert.ok(text.includes(flag), `help does not mention ${flag}`);
        }
        assert.ok(!text.includes('\n\n\n'));
    });
});

describe('describeFailure', () => {
    const url = 'http://127.0.0.1:1/mcp';

    it('turns an HTTP refusal into one line with the status', () => {
        const failure = describeFailure(new StreamableHTTPError(403, 'Error POSTing to endpoint: origin not allowed'), url);
        assert.equal(failure.exitCode, EXIT.REFUSED);
        assert.equal(failure.status, 403);
        assert.ok(failure.line.includes('403 Forbidden'));
        assert.ok(failure.line.includes(url));
        assert.ok(!failure.line.includes('\n'));
    });

    it('turns a connection error into one line with the syscall', () => {
        const error = Object.assign(new TypeError('fetch failed'), { cause: { code: 'ECONNREFUSED' } });
        const failure = describeFailure(error, url);
        assert.equal(failure.exitCode, EXIT.UNREACHABLE);
        assert.ok(failure.line.includes('connection refused'));
        assert.ok(failure.line.includes('ECONNREFUSED'));
    });

    it('names the timeout and points at the flag that changes it', () => {
        const failure = describeFailure(new RequestTimeoutError(1234), url);
        assert.equal(failure.exitCode, EXIT.UNREACHABLE);
        assert.ok(failure.line.includes('1234 ms'));
        assert.ok(failure.line.includes('--timeout'));
    });

    it('collapses a multi-line server body to one line', () => {
        const failure = describeFailure(new StreamableHTTPError(500, 'Error POSTing to endpoint: a\nb\nc'), url);
        assert.ok(!failure.line.includes('\n'));
        assert.ok(failure.line.includes('a b c'));
    });

    it('retries only the failures worth retrying', () => {
        assert.equal(isRetryable(new StreamableHTTPError(503, '')), true);
        assert.equal(isRetryable(new StreamableHTTPError(403, '')), false);
        assert.equal(isRetryable(Object.assign(new Error('x'), { cause: { code: 'ECONNRESET' } })), true);
        assert.equal(isRetryable(Object.assign(new Error('x'), { cause: { code: 'ECONNREFUSED' } })), false);
        assert.equal(isRetryable(new RequestTimeoutError(10)), false);
    });
});

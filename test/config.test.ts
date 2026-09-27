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
        const options = parseOptions([], { VIAFREI_MCP_URL: 'http://127.0.0.1:3000/mcp' });
        assert.equal(options.url, 'http://127.0.0.1:3000/mcp');
    });

    it('lets --url win over the environment', () => {
        const options = parseOptions(['--url', 'http://127.0.0.1:9/mcp'], { VIAFREI_MCP_URL: 'http://127.0.0.1:3000/mcp' });
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

    // The asymmetry is deliberate and easy to "fix" wrongly, so it is pinned
    // here: `src/fetch.ts` retries a 429 RESPONSE because it can read the
    // `Retry-After` that came with it, while this function holds only a thrown
    // error and would retry after the fixed delay — which for a rate limit is
    // the thing that makes it worse rather than better. See the docblock on
    // `isRetryable`; if you add 429 below, the retry test in
    // `retry-after.test.ts` will still pass and this is the only place that says
    // why you should not.
    it('does not treat a thrown 429 as retryable, unlike a 429 response', () => {
        assert.equal(isRetryable(new StreamableHTTPError(429, '')), false);
    });

    // #4: a hint, never a rewrite. Appending `/mcp` to what somebody typed would
    // hide the case where the server really is at `/`.
    it('hints at /mcp when a pathless URL gets a 404', () => {
        for (const pathless of ['http://127.0.0.1:3000', 'http://127.0.0.1:3000/']) {
            const failure = describeFailure(new StreamableHTTPError(404, ''), pathless);
            assert.ok(failure.line.includes('the URL has no path'), `no hint for ${pathless}`);
            assert.ok(failure.line.includes('/mcp'), `the hint for ${pathless} does not name the path`);
            assert.ok(failure.line.includes('404'), 'the hint replaced the status');
            assert.ok(failure.line.includes(pathless), 'the hint replaced the URL');
            assert.ok(!failure.line.includes('\n'), 'the hint added a second line');
        }
    });

    it('does not hint when the URL already has a path', () => {
        for (const withPath of ['http://127.0.0.1:3000/mcp', 'http://127.0.0.1:3000/api/mcp']) {
            const failure = describeFailure(new StreamableHTTPError(404, ''), withPath);
            assert.ok(!failure.line.includes('the URL has no path'), `hinted for ${withPath}`);
        }
    });

    it('never hints on a status that is not 404, whatever the path', () => {
        for (const status of [403, 500, 502]) {
            const failure = describeFailure(new StreamableHTTPError(status, ''), 'http://127.0.0.1:3000');
            assert.ok(!failure.line.includes('the URL has no path'), `hinted on HTTP ${status}`);
        }
    });

    it('skips the hint rather than throwing when the URL will not parse', () => {
        // A failure message that itself throws is the worst version of this bug.
        const failure = describeFailure(new StreamableHTTPError(404, ''), 'not a url at all');
        assert.ok(!failure.line.includes('the URL has no path'));
        assert.ok(!failure.line.includes('\n'));
    });
});

describe('VIAFREI_MCP_HEADER', () => {
    it('sets a header from the environment', () => {
        const options = parseOptions([], { VIAFREI_MCP_HEADER: 'Authorization: Bearer abc' });
        assert.deepEqual(options.headers, { Authorization: 'Bearer abc' });
    });

    it('takes several headers separated by a newline', () => {
        const options = parseOptions([], { VIAFREI_MCP_HEADER: 'X-One: 1\nX-Two: 2' });
        assert.deepEqual(options.headers, { 'X-One': '1', 'X-Two': '2' });
    });

    it('ignores blank lines, so a trailing newline is not an error', () => {
        const options = parseOptions([], { VIAFREI_MCP_HEADER: 'X-One: 1\n\n  \nX-Two: 2\n' });
        assert.deepEqual(options.headers, { 'X-One': '1', 'X-Two': '2' });
    });

    it('lets --header of the same name win over the variable', () => {
        const options = parseOptions(['--header', 'Authorization: Bearer flag'], {
            VIAFREI_MCP_HEADER: 'Authorization: Bearer env'
        });
        assert.deepEqual(options.headers, { Authorization: 'Bearer flag' });
    });

    it('adds a --header of a different name alongside the variable', () => {
        const options = parseOptions(['--header', 'X-Flag: f'], { VIAFREI_MCP_HEADER: 'X-Env: e' });
        assert.deepEqual(options.headers, { 'X-Env': 'e', 'X-Flag': 'f' });
    });

    it('names the variable in the error, not the flag the reader did not type', () => {
        // Sending somebody to --header when they set an environment variable
        // sends them to the wrong place to fix it.
        assert.throws(
            () => parseOptions([], { VIAFREI_MCP_HEADER: 'no colon here' }),
            (error: unknown) => {
                assert.ok(error instanceof UsageError);
                assert.ok(error.message.includes('VIAFREI_MCP_HEADER'), error.message);
                assert.ok(!error.message.includes('--header'), error.message);
                return true;
            }
        );
    });

    it('refuses a transport-owned header name from the variable too', () => {
        for (const reserved of ['Mcp-Session-Id: x', 'content-type: text/plain', 'Host: elsewhere']) {
            assert.throws(
                () => parseOptions([], { VIAFREI_MCP_HEADER: reserved }),
                (error: unknown) => {
                    assert.ok(error instanceof UsageError);
                    assert.ok(error.message.includes('VIAFREI_MCP_HEADER'), error.message);
                    assert.ok(error.message.includes('cannot be overridden'), error.message);
                    return true;
                },
                reserved
            );
        }
    });

    it('is ignored when empty, like the other two variables', () => {
        assert.deepEqual(parseOptions([], { VIAFREI_MCP_HEADER: '' }).headers, {});
        assert.deepEqual(parseOptions([], { VIAFREI_MCP_HEADER: '   ' }).headers, {});
    });

    it('is documented in the help text', () => {
        const text = helpText('1.0.0');
        assert.ok(text.includes('VIAFREI_MCP_HEADER'));
        assert.ok(text.includes('newline'), 'the help text does not say how to separate several headers');
    });
});

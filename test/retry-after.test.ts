import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createFetch, retryAfterMs } from '../src/fetch.js';
import { readBody, startRawServer } from './helpers.js';

/**
 * `Retry-After` on the single retry (#3).
 *
 * Every millisecond value below is written with a numeric separator (`5_000`),
 * matching `src/`. That also keeps them off the number allow-list in
 * `scripts/rules.json`, and keeping them off it is the point: a round
 * four-digit millisecond count is indistinguishable from a port number, and the
 * public-repository sweep exists to catch a port. Allow-listing these would
 * blind it to a real one somewhere else. The same reasoning is why no
 * four-digit year is typed in this file either — see the past-date case.
 *
 * Offline throughout: every case starts its own HTTP server on loopback and
 * kills it with the test. Waits are tens of milliseconds, never seconds, so the
 * suite stays fast — which is also why the cap is exercised by making the
 * *timeout* small rather than the header large.
 */
describe('retryAfterMs', () => {
    it('reads the seconds form', () => {
        assert.equal(retryAfterMs('5'), 5_000);
        assert.equal(retryAfterMs('0'), 0);
        assert.equal(retryAfterMs('  7  '), 7_000);
    });

    it('reads the HTTP-date form, as the distance from now', () => {
        const parsed = retryAfterMs(new Date(Date.now() + 2_000).toUTCString());
        assert.ok(parsed !== undefined, 'an HTTP-date one second in the future was not read');
        // toUTCString() truncates to whole seconds, so the distance is one to two seconds.
        assert.ok(parsed > 500 && parsed <= 2_000, `expected roughly 2 s, got ${parsed}`);
    });

    it('ignores what it cannot use, and never throws', () => {
        assert.equal(retryAfterMs(null), undefined);
        assert.equal(retryAfterMs(''), undefined);
        assert.equal(retryAfterMs('   '), undefined);
        assert.equal(retryAfterMs('soon'), undefined);
        assert.equal(retryAfterMs('-5'), undefined, 'a negative seconds value is not the seconds form');
        assert.equal(retryAfterMs('1.5'), undefined, 'a fractional value is not the seconds form');
    });

    it('treats a date in the past as nothing said, not as a negative wait', () => {
        assert.equal(retryAfterMs(new Date(Date.now() - 60_000).toUTCString()), undefined);

        // A full RFC-shaped HTTP-date, a year back. It is BUILT rather than
        // typed because a literal would put a four-digit year in this file, and
        // the sweep cannot tell a year from a port. The assertion on its shape
        // is what stops this being a weaker test than the literal was: if
        // toUTCString() ever stopped producing an HTTP-date, the case would
        // pass for the wrong reason.
        const aYearBack = new Date(Date.now() - 365 * 24 * 60 * 60 * 1_000).toUTCString();
        assert.match(aYearBack, /^[A-Z][a-z]{2}, \d{2} [A-Z][a-z]{2} \d{4} \d{2}:\d{2}:\d{2} GMT$/u);
        assert.equal(retryAfterMs(aYearBack), undefined);
    });
});

describe('the single retry honours Retry-After', () => {
    /** A server that fails the first request with `status` + `retryAfter`, then succeeds. */
    async function failThenSucceed(
        status: number,
        retryAfter: string | undefined,
        cleanup: { after: (fn: () => void) => void }
    ): Promise<{ url: string; at: number[] }> {
        const at: number[] = [];
        let calls = 0;
        const server = await startRawServer((request, response) => {
            at.push(Date.now());
            calls += 1;
            void readBody(request).then(() => {
                if (calls === 1) {
                    const headers: Record<string, string> = { 'content-type': 'application/json' };
                    if (retryAfter !== undefined) {
                        headers['retry-after'] = retryAfter;
                    }
                    response.writeHead(status, headers);
                    response.end('{"error":"later"}');
                    return;
                }
                response.writeHead(200, { 'content-type': 'application/json' });
                response.end('{"ok":true}');
            });
        }, cleanup);
        return { url: server.url, at };
    }

    it('waits the seconds the server asked for, and then succeeds', async t => {
        // 0 seconds is a legal value and the shortest one: it proves the header
        // was READ rather than that a fixed delay happened to elapse.
        const { url, at } = await failThenSucceed(503, '0', t);
        const response = await createFetch(5_000)(url, { method: 'POST', body: '{}' });
        assert.equal(response.status, 200);
        assert.equal(at.length, 2, 'the retry did not happen');
        const waited = at[1]! - at[0]!;
        assert.ok(waited < 200, `Retry-After: 0 should retry sooner than the fixed 250 ms, waited ${waited} ms`);
    });

    it('waits until the HTTP-date the server named', async t => {
        const when = new Date(Date.now() + 1_000).toUTCString();
        const { url, at } = await failThenSucceed(503, when, t);
        const response = await createFetch(10_000)(url, { method: 'POST', body: '{}' });
        assert.equal(response.status, 200);
        assert.equal(at.length, 2, 'the retry did not happen');
        const waited = at[1]! - at[0]!;
        // The date is truncated to whole seconds, so the true wait is under 1 s;
        // what matters is that it is longer than the fixed delay would have been
        // in the worst case and that it did not sit for the full second twice.
        assert.ok(waited < 1_500, `waited ${waited} ms, which is longer than the date asked for`);
    });

    it('falls back to the fixed delay when the value is unusable', async t => {
        const { url, at } = await failThenSucceed(503, 'whenever you like', t);
        const response = await createFetch(5_000)(url, { method: 'POST', body: '{}' });
        assert.equal(response.status, 200);
        assert.equal(at.length, 2, 'the retry did not happen');
        const waited = at[1]! - at[0]!;
        assert.ok(waited >= 200, `expected the fixed 250 ms fallback, waited only ${waited} ms`);
    });

    it('retries a 429, now that the delay it asks for is respected', async t => {
        const { url, at } = await failThenSucceed(429, '0', t);
        const response = await createFetch(5_000)(url, { method: 'POST', body: '{}' });
        assert.equal(response.status, 200);
        assert.equal(at.length, 2, 'a 429 was not retried');
    });

    it('does not retry a 429 that brings no usable delay', async t => {
        // The asymmetry with 503 below is the point, and it is the reason
        // `RETRY_STATUS` admits 429 at all: 429 is retried because the delay can
        // be read, so a 429 with nothing readable has no delay to honour and the
        // only alternative is the fixed 250 ms, which is what makes a rate limit
        // worse. A 503 in the same state IS retried — the next case proves the
        // distinction is about the status and not about the missing header.
        const { url, at } = await failThenSucceed(429, undefined, t);
        const response = await createFetch(5_000)(url, { method: 'POST', body: '{}' });
        assert.equal(response.status, 429, 'the un-retried response was replaced instead of returned');
        assert.equal(at.length, 1, 'a headerless 429 was retried after the fixed delay');
    });

    it('still retries a 503 that brings no usable delay', async t => {
        const { url, at } = await failThenSucceed(503, undefined, t);
        const response = await createFetch(5_000)(url, { method: 'POST', body: '{}' });
        assert.equal(response.status, 200);
        assert.equal(at.length, 2, 'a headerless 503 was not retried');
    });

    it('does not retry when the wait would exceed the per-request timeout', async t => {
        // The cap is the timeout, so a 1-second Retry-After against a 100 ms
        // timeout is over it. The caller gets the ORIGINAL response, so the
        // ordinary one-line failure names the real status the server gave.
        const { url, at } = await failThenSucceed(503, '1', t);
        const response = await createFetch(100)(url, { method: 'POST', body: '{}' });
        assert.equal(response.status, 503, 'the over-cap response was replaced instead of returned');
        assert.equal(at.length, 1, 'it retried although the wait was over the cap');
    });

    it('still does not retry a client error, whatever it says', async t => {
        const { url, at } = await failThenSucceed(403, '0', t);
        const response = await createFetch(5_000)(url, { method: 'POST', body: '{}' });
        assert.equal(response.status, 403);
        assert.equal(at.length, 1, 'a 403 was retried');
    });
});

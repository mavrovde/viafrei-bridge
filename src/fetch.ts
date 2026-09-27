import type { FetchLike } from '@modelcontextprotocol/sdk/shared/transport.js';
import { MAX_REDIRECTS, RedirectRefusedError, RequestTimeoutError, isRetryable } from './failure.js';

/**
 * Statuses worth exactly one more attempt.
 *
 * `429` is here only because we now read `Retry-After` (see `retryAfterMs`), and
 * only when that header gives us a usable delay — see the 429 branch below. A
 * rate limit retried after a fixed 250 ms is worse than not retrying at all: it
 * costs the server another rejection and the user another wait, and it arrives
 * before the server said to come back. The two changes belong together and
 * neither is correct alone, which is why membership of this set is not on its own
 * enough to retry a 429.
 */
const RETRY_STATUS = new Set([429, 502, 503, 504]);

/** How long to wait before the single retry when the server does not say. */
const RETRY_DELAY_MS = 250;

/**
 * How long the server asked us to wait, in milliseconds, or `undefined` for
 * "it did not say anything we can use".
 *
 * `Retry-After` has two legal forms (RFC 9110 § 10.2.3) and both occur in the
 * wild: a number of seconds, and an HTTP-date. Anything else — and there is
 * plenty of anything else behind proxies — is ignored rather than thrown on,
 * because this is the failure path and an unparseable header must not become a
 * second failure.
 *
 * A date in the past yields `undefined` too, not a negative wait: a server
 * whose clock is behind ours is asking us to retry immediately, and the fixed
 * delay is the more honest reading of that than zero.
 *
 * Exported for its own tests. The two legal forms and the several illegal ones
 * are where the bugs live, and reaching each of them through a stub server
 * would mean a stub per case and a suite that sleeps.
 */
export function retryAfterMs(header: string | null): number | undefined {
    if (header === null) {
        return undefined;
    }
    const raw = header.trim();
    if (raw === '') {
        return undefined;
    }
    if (/^\d+$/u.test(raw)) {
        return Number(raw) * 1_000;
    }
    const when = Date.parse(raw);
    if (Number.isNaN(when)) {
        return undefined;
    }
    const wait = when - Date.now();
    return wait > 0 ? wait : undefined;
}

const REDIRECT_STATUS = new Set([301, 302, 303, 307, 308]);

const sleep = (ms: number): Promise<void> => new Promise(resolve => setTimeout(resolve, ms));

const originOf = (url: string): string => new URL(url).origin;

/**
 * `fetch` with a timeout, exactly one retry, and an explicit redirect policy.
 *
 * Three deliberate decisions, all because getting them wrong is worse than the
 * feature:
 *
 * - **The event stream is never timed out.** The standalone `GET` is a
 *   long-lived stream by design; a 30-second deadline on it would look like a
 *   flaky server every 30 seconds.
 * - **A timeout is not retried.** One retry after a timeout doubles the worst
 *   case and hides a slow endpoint behind a longer wait. Retry covers the
 *   momentary failures (a reset socket, a 503 from a proxy in front of the
 *   server), not a server that is simply not answering.
 * - **Redirects are followed by hand, and only within one origin.** Every
 *   request here carries whatever `--header` the user gave us, which is how an
 *   API key gets to the server. `redirect: 'follow'` would hand those headers
 *   to whatever the `Location` says - `fetch` drops `Authorization` across
 *   origins, but it does not drop `X-Api-Key`, and a server that can answer a
 *   redirect can choose the origin. So the redirect is resolved here: same
 *   origin is followed with the headers, a different origin is refused with one
 *   line naming both. Nobody's key travels somewhere they did not point it.
 */
export function createFetch(timeoutMs: number): FetchLike {
    return async (url, init) => {
        const method = (init?.method ?? 'GET').toUpperCase();
        const isEventStream = method === 'GET';

        /** One request, no redirect handling, with our timeout attached. */
        const once = async (target: string | URL, requestInit: RequestInit | undefined): Promise<Response> => {
            const withPolicy: RequestInit = { ...requestInit, redirect: 'manual' };
            if (isEventStream) {
                return fetch(target, withPolicy);
            }
            const timeout = AbortSignal.timeout(timeoutMs);
            const signals: AbortSignal[] = [timeout];
            if (requestInit?.signal) {
                signals.push(requestInit.signal);
            }
            try {
                return await fetch(target, { ...withPolicy, signal: AbortSignal.any(signals) });
            } catch (error) {
                if (timeout.aborted && requestInit?.signal?.aborted !== true) {
                    throw new RequestTimeoutError(timeoutMs);
                }
                throw error;
            }
        };

        /** One request plus any same-origin redirects it asks for. */
        const attempt = async (): Promise<Response> => {
            let target: string = String(url);
            let requestInit: RequestInit | undefined = init;

            for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
                const response = await once(target, requestInit);
                if (!REDIRECT_STATUS.has(response.status)) {
                    return response;
                }

                const location = response.headers.get('location');
                await response.body?.cancel().catch(() => undefined);
                if (location === null || location.trim() === '') {
                    throw new RedirectRefusedError({
                        reason: 'no-location',
                        from: target,
                        to: '(none)',
                        status: response.status
                    });
                }

                const next = new URL(location, target);
                if (next.origin !== originOf(target)) {
                    throw new RedirectRefusedError({
                        reason: 'cross-origin',
                        from: target,
                        to: next.origin,
                        status: response.status
                    });
                }

                // Same origin: the headers are already meant for this server, so
                // following is safe. 303 (and the historical 301/302 on a POST)
                // means "ask again with GET, without the body".
                const dropsBody = response.status === 303 || ((response.status === 301 || response.status === 302) && method !== 'GET');
                if (dropsBody) {
                    const { body: _body, ...rest } = requestInit ?? {};
                    requestInit = { ...rest, method: 'GET' };
                }
                target = next.toString();
            }

            throw new RedirectRefusedError({
                reason: 'too-many',
                from: String(url),
                to: target,
                status: 0
            });
        };

        const canRetry = (): boolean => !isEventStream && init?.signal?.aborted !== true;

        let response: Response;
        try {
            response = await attempt();
        } catch (error) {
            if (canRetry() && isRetryable(error)) {
                await sleep(RETRY_DELAY_MS);
                return attempt();
            }
            throw error;
        }

        if (canRetry() && RETRY_STATUS.has(response.status)) {
            // Read the header BEFORE cancelling anything: if we decide not to
            // retry, this response is the one the caller gets, and its body is
            // where the SDK finds the detail our one-line message quotes.
            const asked = retryAfterMs(response.headers.get('retry-after'));
            if (response.status === 429 && asked === undefined) {
                // A 429 with nothing usable in `Retry-After` is not retried at
                // all. `RETRY_STATUS` admits 429 on the strength of being able
                // to read the delay the server asked for; when there is no such
                // delay, the only thing left is the fixed 250 ms, and that is
                // exactly what the docblock on `RETRY_STATUS` calls worse than
                // not retrying. Keeping the retry here would leave this file
                // arguing against its own behaviour — and `isRetryable` refuses a
                // *thrown* 429 for precisely this reason, so the two paths now
                // agree wherever they hold the same information.
                return response;
            }
            if (asked !== undefined && asked > timeoutMs) {
                // The cap, and why it is the per-request timeout rather than a
                // number of its own: the user already told us how long they are
                // willing to wait for one request. A server answering
                // `Retry-After: 3600` must not make `npx viafrei` sit silently
                // for an hour, and a wait longer than the deadline they set is
                // not a retry they asked for. So we do not retry at all and let
                // the ordinary failure line say what came back — it already
                // names the URL and the status, which is what they need.
                return response;
            }
            await response.body?.cancel().catch(() => undefined);
            await sleep(asked ?? RETRY_DELAY_MS);
            return attempt();
        }

        return response;
    };
}

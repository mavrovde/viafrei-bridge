import type { FetchLike } from '@modelcontextprotocol/sdk/shared/transport.js';
import { RedirectRefusedError, RequestTimeoutError, isRetryable } from './failure.js';

/** Statuses that mean "the hop in front of the server had a moment". */
const RETRY_STATUS = new Set([502, 503, 504]);

/** How long to wait before the single retry. */
const RETRY_DELAY_MS = 250;

/** How many same-origin hops are a redirect, and how many are a loop. */
const MAX_REDIRECTS = 5;

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
            await response.body?.cancel().catch(() => undefined);
            await sleep(RETRY_DELAY_MS);
            return attempt();
        }

        return response;
    };
}

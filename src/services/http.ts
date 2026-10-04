/**
 * Shared HTTP helper for third-party JSON APIs (LRCLIB, Google Translate).
 *
 * Raw `fetch` + `res.json()` is unsafe against these services:
 *  - Cloudflare in front of LRCLIB returns an HTML body for 5xx, which makes
 *    `.json()` throw `Unexpected character: e` (the body starts with
 *    "error code: 520").
 *  - A 404 can carry an empty body, throwing `Unexpected end of input`.
 *  - A 400 returns `text/plain`, also not JSON.
 *  - LRCLIB returns 503 `ServerOverloaded` with a JSON *object* rather than an
 *    array, which callers expecting `data[]` silently misread as "no results".
 *
 * So failures are returned as values, never thrown, and transient statuses are
 * retried with backoff.
 */

export interface JsonResult<T> {
  ok: boolean;
  status: number; // 0 when the request never produced a response
  data: T | null;
  /** True when the failure is worth retrying later (5xx, 429, network). */
  transient: boolean;
  error?: string;
}

export interface FetchJsonOptions {
  timeoutMs?: number;
  /** Additional attempts after the first (so 2 => up to 3 requests). */
  retries?: number;
  headers?: Record<string, string>;
  method?: 'GET' | 'POST';
  body?: string;
}

const DEFAULT_TIMEOUT_MS = 8000;
const DEFAULT_RETRIES = 2;
const BASE_BACKOFF_MS = 400;

/** 408/429 and every 5xx are worth another attempt; 4xx are not. */
const isRetryableStatus = (status: number): boolean =>
  status === 408 || status === 429 || (status >= 500 && status <= 599);

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Exponential backoff with jitter, so parallel callers don't sync up. */
const backoffDelay = (attempt: number): number =>
  BASE_BACKOFF_MS * Math.pow(2, attempt) + Math.random() * 200;

/** Honors `Retry-After` (seconds) when the server sends it. */
const retryAfterMs = (response: Response): number | null => {
  const header = response.headers?.get?.('retry-after');
  if (!header) return null;
  const seconds = Number(header);
  if (Number.isFinite(seconds) && seconds >= 0) return Math.min(seconds * 1000, 10000);
  return null;
};

/**
 * Performs a JSON request and returns a result rather than throwing.
 *
 * `data` is null whenever the response was not parseable JSON, so callers must
 * check `ok` (and typically that `data` has the expected shape) before use.
 */
export async function fetchJson<T = any>(
  url: string,
  options: FetchJsonOptions = {},
): Promise<JsonResult<T>> {
  const {
    timeoutMs = DEFAULT_TIMEOUT_MS,
    retries = DEFAULT_RETRIES,
    headers,
    method = 'GET',
    body,
  } = options;

  const maxAttempts = Math.max(1, retries + 1);
  let lastStatus = 0;
  let lastError = 'Request failed';

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    // A fresh controller per attempt; a timed-out one stays aborted.
    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timer = controller
      ? setTimeout(() => controller.abort(), timeoutMs)
      : null;

    try {
      const response = await fetch(url, {
        method,
        body,
        headers: headers ?? undefined,
        signal: controller?.signal as any,
      });

      const status = response.status;
      lastStatus = status;

      if (!response.ok) {
        lastError = `HTTP ${status}`;

        if (isRetryableStatus(status) && attempt < maxAttempts - 1) {
          const wait = retryAfterMs(response) ?? backoffDelay(attempt);
          await sleep(wait);
          continue;
        }

        // A non-retryable error, or we're out of attempts.
        return {
          ok: false,
          status,
          data: null,
          transient: isRetryableStatus(status),
          error: lastError,
        };
      }

      // Guard the parse: an HTML error page or an empty body must not throw.
      const contentType = response.headers?.get?.('content-type') ?? '';
      const text = await response.text();
      const trimmed = text.trim();

      if (trimmed === '') {
        return { ok: false, status, data: null, transient: false, error: 'Empty response body' };
      }

      // Only trust the content-type if the body doesn't already look like JSON,
      // since some servers omit or mislabel it.
      const looksJson = trimmed.startsWith('{') || trimmed.startsWith('[');
      if (!looksJson && contentType && !contentType.includes('json')) {
        return {
          ok: false,
          status,
          data: null,
          transient: false,
          error: `Expected JSON but received ${contentType || 'unknown content type'}`,
        };
      }

      try {
        return { ok: true, status, data: JSON.parse(trimmed) as T, transient: false };
      } catch {
        return { ok: false, status, data: null, transient: false, error: 'Malformed JSON response' };
      }
    } catch (e: any) {
      /**
       * Classify the failure rather than assuming it is transient.
       *
       * Everything used to be marked `transient: true`, so a permanent
       * condition - no internet, DNS failure, an unreachable host - was
       * reported to the user as "the lyrics service is busy, try again in a
       * moment". Retrying those is pointless and the message is misleading:
       * it points at the server when the problem is local connectivity.
       *
       * A timeout or an explicit abort is worth retrying. A connection-level
       * failure (TypeError from fetch: DNS, refused, offline) is not.
       */
      const aborted = e?.name === 'AbortError';
      const isConnectionFailure = e instanceof TypeError;

      lastError = aborted
        ? `Request timed out after ${timeoutMs}ms`
        : (e?.message ?? 'Network error');

      // Only retry genuinely transient conditions.
      if (!isConnectionFailure && attempt < maxAttempts - 1) {
        await sleep(backoffDelay(attempt));
        continue;
      }

      return {
        ok: false,
        status: lastStatus,
        data: null,
        // Offline / DNS / refused are not worth retrying and not the server's fault.
        transient: !isConnectionFailure,
        error: lastError,
      };
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  return { ok: false, status: lastStatus, data: null, transient: true, error: lastError };
}

/**
 * Shared fetch with caller-supplied retry policy for 429 and transient failures.
 * Wave 1 (graphql / extract / llm) wires this in; Wave 0 only ships the library.
 */

/**
 * A single HTTP request. `init` is required on the object (pass undefined when
 * unused) so callers stay explicit -- no hidden RequestInit defaults.
 */
export interface FetchRequest {
  readonly input: RequestInfo | URL;
  readonly init: RequestInit | undefined;
}

/**
 * Fully explicit retry policy. Every field is required from the caller; this
 * module never invents maxAttempts, delays, or a fetch implementation.
 *
 * Transient handling:
 * - 429: always retried. Delay from Retry-After (delay-seconds or HTTP-date)
 *   when present; otherwise exponential backoff from baseDelayMs.
 * - statuses listed in retryOn: exponential backoff (baseDelayMs * 2^attemptIndex).
 * - network failures (fetch throws TypeError): exponential backoff.
 * Exhaustion throws Error with status (when known) and attempt count.
 */
export interface RetryPolicy {
  /** Total tries including the first. Must be >= 1. */
  readonly maxAttempts: number;
  /** Base delay in ms for exponential backoff (attempt index starts at 0). */
  readonly baseDelayMs: number;
  /** When true, scale backoff by a random factor in [0.5, 1.5). */
  readonly jitter: boolean;
  /**
   * Extra HTTP statuses to retry (e.g. 500, 502, 503). 429 is always retried
   * and does not need to appear here.
   */
  readonly retryOn: readonly number[];
  /** Fetch implementation (globalThis.fetch or a test double). */
  readonly fetch: (
    input: RequestInfo | URL,
    init?: RequestInit,
  ) => Promise<Response>;
  /** Sleep for backoff delays (tests inject a no-op or delay tracker). */
  readonly sleep: (ms: number) => Promise<void>;
}

const requestUrl = (input: RequestInfo | URL): string => {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.href;
  return input.url;
};

/**
 * Parse Retry-After as milliseconds. Supports delay-seconds and HTTP-date.
 * Returns null when the header is missing or unparseable.
 */
export const parseRetryAfterMs = (
  header: string | null,
  nowMs: number,
): number | null => {
  if (header === null) return null;
  const trimmed = header.trim();
  if (trimmed.length === 0) return null;

  const asSeconds = Number(trimmed);
  if (Number.isFinite(asSeconds) && asSeconds >= 0) {
    return Math.floor(asSeconds * 1000);
  }

  const asDate = Date.parse(trimmed);
  if (Number.isFinite(asDate)) {
    return Math.max(0, asDate - nowMs);
  }

  return null;
};

const exponentialDelayMs = (
  baseDelayMs: number,
  attemptIndex: number,
  jitter: boolean,
): number => {
  const raw = baseDelayMs * Math.pow(2, attemptIndex);
  if (!jitter) return raw;
  return Math.floor(raw * (0.5 + Math.random()));
};

const isNetworkError = (error: unknown): boolean => error instanceof TypeError;

const exhaustedMessage = (
  url: string,
  attempts: number,
  status: number | null,
  cause: string,
): string => {
  const statusPart = status === null ? "no HTTP status" : `HTTP ${status}`;
  return (
    `fetchWithRetry exhausted after ${attempts} attempt(s) ` +
    `(${statusPart}) for ${url}: ${cause}`
  );
};

const delayForResponse = (
  response: Response,
  policy: RetryPolicy,
  attemptIndex: number,
): number => {
  if (response.status === 429) {
    const retryAfterMs = parseRetryAfterMs(
      response.headers.get("Retry-After"),
      Date.now(),
    );
    if (retryAfterMs !== null) return retryAfterMs;
  }
  return exponentialDelayMs(policy.baseDelayMs, attemptIndex, policy.jitter);
};

const isRetryableStatus = (
  status: number,
  retryOn: readonly number[],
): boolean => status === 429 || retryOn.includes(status);

/**
 * Fetch with retries driven entirely by `policy`. Non-retryable responses are
 * returned as-is so callers can handle 4xx; only exhausted retries throw.
 */
export const fetchWithRetry = (
  request: FetchRequest,
  policy: RetryPolicy,
): Promise<Response> => {
  if (policy.maxAttempts < 1) {
    return Promise.reject(
      new Error(
        `fetchWithRetry: maxAttempts must be >= 1, got ${policy.maxAttempts}`,
      ),
    );
  }

  const url = requestUrl(request.input);

  const run = (attemptIndex: number): Promise<Response> =>
    policy.fetch(request.input, request.init).then(
      (response) => {
        const retryable = isRetryableStatus(response.status, policy.retryOn);
        const nextAttempt = attemptIndex + 1;

        if (!retryable) return Promise.resolve(response);

        if (nextAttempt >= policy.maxAttempts) {
          return Promise.reject(
            new Error(
              exhaustedMessage(
                url,
                policy.maxAttempts,
                response.status,
                "retryable status persisted",
              ),
            ),
          );
        }

        const delayMs = delayForResponse(response, policy, attemptIndex);
        return policy.sleep(delayMs).then(() => run(nextAttempt));
      },
      (error: unknown) => {
        const nextAttempt = attemptIndex + 1;
        const network = isNetworkError(error);

        if (!network) return Promise.reject(error);

        if (nextAttempt >= policy.maxAttempts) {
          const msg = error instanceof Error ? error.message : String(error);
          return Promise.reject(
            new Error(exhaustedMessage(url, policy.maxAttempts, null, msg)),
          );
        }

        const delayMs = exponentialDelayMs(
          policy.baseDelayMs,
          attemptIndex,
          policy.jitter,
        );
        return policy.sleep(delayMs).then(() => run(nextAttempt));
      },
    );

  return run(0);
};

/** xtracticle.com HTTP client -- fetchWithRetry + Zod parse. */

import { CONFIG } from "../config.ts";
import { fetchWithRetry, type RetryPolicy } from "../utils/http.ts";
import { parseXtracticleResponse, type XtracticleTweet } from "./xtracticle-schema.ts";

/** Outcome of fetching one tweet thread from xtracticle. */
export type FetchThreadResult =
  | { readonly kind: "ok"; readonly tweet: XtracticleTweet }
  | { readonly kind: "http_error"; readonly status: number }
  | { readonly kind: "no_tweets" }
  | { readonly kind: "empty" }
  | { readonly kind: "parse_error"; readonly message: string };

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/** Retry policy driven entirely by CONFIG (caller-owned numbers, no hidden defaults). */
const xtracticleRetryPolicy = (): RetryPolicy => ({
  maxAttempts: Math.max(1, CONFIG.maxRetries),
  baseDelayMs: CONFIG.retryBaseMs,
  jitter: true,
  retryOn: [500, 502, 503, 504],
  fetch: globalThis.fetch.bind(globalThis),
  sleep,
});

/** First tweet in a validated response, or null when the array is empty. */
export const getTweet = (
  tweets: readonly XtracticleTweet[],
): XtracticleTweet | null => tweets[0] ?? null;

/**
 * Fetch and validate one xtracticle thread. Non-retryable HTTP statuses
 * (including 404) return http_error; exhausted retries throw from fetchWithRetry.
 */
export const fetchThread = async (
  tweetId: string,
): Promise<FetchThreadResult> => {
  const response = await fetchWithRetry(
    {
      input: `${CONFIG.xtracticleBase}/${tweetId}`,
      init: undefined,
    },
    xtracticleRetryPolicy(),
  );

  if (!response.ok) {
    return { kind: "http_error", status: response.status };
  }

  let raw: unknown;
  try {
    raw = await response.json();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { kind: "parse_error", message: `invalid JSON: ${msg}` };
  }

  let data;
  try {
    data = parseXtracticleResponse(raw);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { kind: "parse_error", message: msg };
  }

  if (data.tweets.length === 0) {
    return { kind: "no_tweets" };
  }

  const tweet = getTweet(data.tweets);
  if (tweet === null) {
    return { kind: "empty" };
  }

  return { kind: "ok", tweet };
};

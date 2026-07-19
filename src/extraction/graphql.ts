/** GraphQL client for X bookmarks API. GET + URLSearchParams; retries via http.ts. */

import type { TweetData } from "./types.ts";
import { pooledMap } from "@std/async/pool";
import type {
  CheckedSource,
  FetchedBatchSource,
  FetchedOneSource,
  UncheckedSource,
} from "./index.ts";
import { parseResponse } from "./parse.ts";
import { BookmarksResponseSchema } from "./schema.ts";
import { logger } from "./../utils/logger.ts";
import { fetchWithRetry, type RetryPolicy } from "./../utils/http.ts";
import { CONFIG } from "./../config.ts";

const BOOKMARKS_QUERY_ID = "Z9GWmP0kP2dajyckAaDUBw";
const BOOKMARKS_OPERATION = "Bookmarks";
const X_PUBLIC_BEARER =
  "AAAAAAAAAAAAAAAAAAAAANRILgAAAAAAnNwIzUejRCOuH5E6I8xnZz4puTs%3D1Zv7ttfk8LF81IUq16cHjhLTvJu4FA33AGWWjCpTnA";

const GRAPHQL_FEATURES = {
  graphql_timeline_v2_bookmark_timeline: true,
  rweb_tipjar_consumption_enabled: true,
  responsive_web_graphql_exclude_directive_enabled: true,
  verified_phone_label_enabled: false,
  creator_subscriptions_tweet_preview_api_enabled: true,
  responsive_web_graphql_timeline_navigation_enabled: true,
  responsive_web_graphql_skip_user_profile_image_extensions_enabled: false,
  communities_web_enable_tweet_community_results_fetch: true,
  c9s_tweet_anatomy_moderator_badge_enabled: true,
  articles_preview_enabled: true,
  responsive_web_edit_tweet_api_enabled: true,
  tweetypie_unmention_optimization_enabled: true,
  responsive_web_uc_gql_enabled: true,
  vibe_api_enabled: true,
  responsive_web_text_conversations_enabled: false,
  freedom_of_speech_not_reach_fetch_enabled: true,
  longform_notetweets_consumption_enabled: true,
  longform_notetweets_rich_text_read_enabled: true,
  longform_notetweets_inline_media_enabled: true,
  responsive_web_enhance_cards_enabled: false,
  tweet_with_visibility_results_prefer_gql_limited_actions_policy_enabled: true,
  responsive_web_media_download_video_enabled: false,
};

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

/** Shared external-call budget from CONFIG for all X GraphQL fetches. */
const graphqlRetryPolicy = (): RetryPolicy => ({
  maxAttempts: CONFIG.maxExternalCallAttempts,
  baseDelayMs: CONFIG.retryBaseMs,
  jitter: true,
  retryOn: [500, 502, 503],
  fetch: globalThis.fetch.bind(globalThis),
  sleep,
});

const buildUrl = (cursor: string | undefined, count: number): string => {
  const variables: Record<string, unknown> = { count };
  if (cursor) variables.cursor = cursor;
  const params = new URLSearchParams({
    variables: JSON.stringify(variables),
    features: JSON.stringify(GRAPHQL_FEATURES),
  });
  return `https://x.com/i/api/graphql/${BOOKMARKS_QUERY_ID}/${BOOKMARKS_OPERATION}?${params}`;
};

const buildHeaders = (
  csrfToken: string,
  cookieHeader: string | undefined,
): Record<string, string> => ({
  authorization: `Bearer ${X_PUBLIC_BEARER}`,
  "x-csrf-token": csrfToken,
  "x-twitter-auth-type": "OAuth2Session",
  "x-twitter-active-user": "yes",
  "content-type": "application/json",
  "user-agent":
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36",
  cookie: cookieHeader ?? `ct0=${csrfToken}`,
});

const validateConnectivity = async (
  url: string,
  headers: Record<string, string>,
): Promise<void> => {
  // Don't use HEAD -- X's GraphQL endpoint rejects it with 405
  const resp = await fetchWithRetry(
    { input: url, init: { headers } },
    graphqlRetryPolicy(),
  );

  if (resp.ok) {
    const text = await resp.text().catch(() => "");
    try {
      const parsed: unknown = JSON.parse(text);
      const envelope = BookmarksResponseSchema.safeParse(parsed);
      if (envelope.success) {
        const gqlErrors = envelope.data.errors;
        const hasErrors = Array.isArray(gqlErrors) && gqlErrors.length > 0;
        const hasNoData = envelope.data.data === null ||
          envelope.data.data === undefined;
        if (hasErrors && hasNoData && gqlErrors !== undefined) {
          const messages = gqlErrors.map((e) => e.message).join("; ");
          throw new Error(`GraphQL API auth error: ${messages}`);
        }
      }
    } catch (err) {
      if (err instanceof SyntaxError) {
        // Not JSON -- body might be HTML error page; status check below
      } else {
        throw err;
      }
    }
  }

  if (!resp.ok) throw new Error(`GraphQL API unreachable: ${resp.status}`);
};

const jitter = (): Promise<void> => new Promise((r) => setTimeout(r, 500 + Math.random() * 1000));

const fetchPage = async (
  config: GraphQLConfig,
  cursor: string | undefined,
  count: number,
): Promise<{ records: TweetData[]; nextCursor: string | undefined }> => {
  const url = buildUrl(cursor, count);
  const headers = buildHeaders(config.csrfToken, config.cookieHeader);

  const response = await fetchWithRetry(
    { input: url, init: { headers } },
    graphqlRetryPolicy(),
  );

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`GraphQL API ${response.status}: ${text.slice(0, 300)}`);
  }

  let json: unknown;
  try {
    json = await response.json();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`GraphQL API returned non-JSON body: ${msg}`);
  }

  const { records, nextCursor, stats } = parseResponse(json);
  logger.info("[sync] page parse", {
    entriesSeen: stats.entriesSeen,
    tweetsParsed: stats.tweetsParsed,
    entriesSkipped: stats.entriesSkipped,
  });

  return { records, nextCursor };
};

/** Recursive fetch all pages. Stops after 2 stale pages (0 new tweets). */
const fetchAllPages = async (
  config: GraphQLConfig,
  limit: number,
  count: number,
  existingIds: Set<string>,
  cursor: string | undefined,
  acc: TweetData[][],
  stalePages: number,
): Promise<TweetData[][]> => {
  if (acc.flat().length >= limit) return acc;
  if (stalePages >= 2) return acc;

  const { records, nextCursor } = await fetchPage(config, cursor, count);

  const existingInPage = records.filter((r) => existingIds.has(r.id)).length;
  const newRecords = records.filter((r) => !existingIds.has(r.id));
  const pageIsStale = newRecords.length === 0;

  if (records.length === 0) {
    logger.info(
      `[sync] page returned 0 records (cursor: ${
        cursor ? cursor.slice(0, 20) + "..." : "initial"
      })`,
    );
  } else if (existingInPage === records.length) {
    logger.info(
      `[sync] page: ${records.length} records, all already in DB -- caught up`,
    );
  } else if (existingInPage > 0) {
    logger.info(
      `[sync] page: ${records.length} records (${existingInPage} existing, ${newRecords.length} new)`,
    );
  } else {
    logger.info(`[sync] page: ${records.length} records, all new`);
  }

  const newAcc = [...acc, newRecords];
  const newStalePages = pageIsStale ? stalePages + 1 : 0;

  if (pageIsStale && newStalePages >= 2) return newAcc;
  if (!nextCursor) return newAcc;

  await jitter();

  return fetchAllPages(
    config,
    limit,
    count,
    existingIds,
    nextCursor,
    newAcc,
    newStalePages,
  );
};

const chunk = <T>(arr: T[], size: number): T[][] =>
  Array.from(
    { length: Math.ceil(arr.length / size) },
    (_, i) => arr.slice(i * size, (i + 1) * size),
  );

export interface GraphQLConfig {
  csrfToken: string;
  cookieHeader?: string;
}

export const createGraphQL = (): UncheckedSource<GraphQLConfig> => ({
  check: async (config: GraphQLConfig): Promise<CheckedSource> => {
    if (!config.csrfToken) throw new Error("GraphQL: csrfToken required");

    const url = buildUrl(undefined, 1);
    const headers = buildHeaders(config.csrfToken, config.cookieHeader);
    await validateConnectivity(url, headers);

    return {
      fetchBatch: (
        limit: number,
        concurrency: number,
        existingIds: Set<string>,
      ) => fetchBatchImpl(config, limit, concurrency, existingIds),
      fetchOne: (id: string) => fetchOneImpl(config, id),
    };
  },
});

const fetchBatchImpl = async (
  config: GraphQLConfig,
  limit: number,
  concurrency: number,
  existingIds: Set<string>,
): Promise<FetchedBatchSource> => {
  const pages = await fetchAllPages(
    config,
    limit,
    200,
    existingIds,
    undefined,
    [],
    0,
  );
  const allTweets = pages.flat();

  return {
    processBatch: () => Promise.resolve(allTweets),

    processAll: async () => {
      const batches = chunk(allTweets, 100);
      const batchResults = pooledMap(
        concurrency,
        batches,
        (b: TweetData[]) => Promise.resolve(b),
      );
      const flatResults = await Array.fromAsync(batchResults);
      const results: TweetData[] = flatResults.flat();
      return results;
    },
  };
};

const fetchOneImpl = (
  _config: GraphQLConfig,
  _id: string,
): Promise<FetchedOneSource> => {
  return Promise.resolve({
    processOne: () => {
      throw new Error("fetchOne: single-tweet endpoint TBD");
    },
  });
};

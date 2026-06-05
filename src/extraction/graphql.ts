// graphql.ts -- Clean GraphQL client for X bookmarks API
// Pattern: check() → fetch → process (type-state enforced)
// Uses Deno std pooledMap for concurrent processing
// Matches fieldtheory-cli's request format: GET + URLSearchParams

import type { TweetData } from "./types.ts";
import { pooledMap } from "@std/async/pool";
import type {
  CheckedSource,
  FetchedBatchSource,
  FetchedOneSource,
  UncheckedSource,
} from "./index.ts";
import { TweetDataSchema } from "./schema.ts";

// ── Hard-coded constants ──────────────────────────────────
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

// ── Pure builders (matches fieldtheory-cli exactly) ────────
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
  cookieHeader?: string,
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

// ── Validation (GET check on base URL) ────────────────────
const validateConnectivity = async (
  url: string,
  headers: Record<string, string>,
): Promise<void> => {
  // Don't use HEAD — X's GraphQL endpoint rejects it with 405
  const resp = await fetch(url, { headers });

  // Check for stale-auth response (200 with errors but no data)
  if (resp.ok) {
    const text = await resp.text().catch(() => "");
    try {
      const parsed = JSON.parse(text);
      const hasErrors = Array.isArray(parsed.errors) && parsed.errors.length > 0;
      const hasNoData = !parsed.data;
      if (hasErrors && hasNoData) {
        const messages = parsed.errors.map((e: Record<string, unknown>) => e.message).join("; ");
        throw new Error(`GraphQL API auth error: ${messages}`);
      }
    } catch (err) {
      if (err instanceof SyntaxError) {
        // Not JSON — body might be HTML error page, just check status
      } else {
        throw err; // rethrow our parsed auth error
      }
    }
  }

  if (!resp.ok) throw new Error(`GraphQL API unreachable: ${resp.status}`);
};

// ── Jitter: random delay between requests ───────────────────
const jitter = (): Promise<void> => new Promise((r) => setTimeout(r, 500 + Math.random() * 1000));

// ── Response parsing (uses zod safeParse) ───────────────────
const parseTweet = (tweetResult: Record<string, unknown>): TweetData | null => {
  const result = TweetDataSchema.safeParse(tweetResult);
  if (!result.success) return null;

  const tweet = result.data.tweet;
  const legacy = tweet.legacy;

  // Flatten/transform from nested GraphQL shape → our TweetData
  const authorResult = tweet.core.user_results.result;
  const authorCore = authorResult.core;
  const authorLegacy = authorResult.legacy;

  const mediaEntities = legacy.extended_entities?.media ?? legacy.entities?.media ?? [];
  const media = mediaEntities.map((m) => ({
    type: m.type,
    url: m.media_url_https ?? m.media_url ?? "",
    original_img_url: m.media_info?.original_img_url ?? "",
  }));

  const urlEntities = legacy.entities?.urls ?? [];
  const links = urlEntities
    .map((u) => u.expanded_url)
    .filter((u): u is string => typeof u === "string" && !u.includes("t.co"));

  const noteText = tweet.note_tweet?.note_tweet_results?.result?.text;
  const text = noteText ?? legacy.full_text ?? legacy.text ?? "";

  return {
    id: legacy.id_str,
    text,
    author: {
      screen_name: authorCore.screen_name ?? authorLegacy?.screen_name ?? "",
      name: authorCore.name ?? authorLegacy?.name ?? "",
    },
    created_at: legacy.created_at ?? "",
    media: { all: media },
    links_json: JSON.stringify(links),
    engagement: {
      likeCount: legacy.favorite_count,
      repostCount: legacy.retweet_count,
      replyCount: legacy.reply_count,
      quoteCount: legacy.quote_count,
      bookmarkCount: legacy.bookmark_count,
      viewCount: tweet.views ? Number(tweet.views.count) : undefined,
    },
  };
};

const parseResponse = (
  json: Record<string, unknown>,
): { records: TweetData[]; nextCursor?: string } => {
  // Match fieldtheory-cli exactly: json.data.bookmark_timeline_v2.timeline.instructions
  const data = json.data as Record<string, unknown> | undefined;

  // Diagnostic: check expected structure and log if something's off
  if (!data) {
    const hasErrors = Array.isArray(json.errors) && (json.errors as unknown[]).length > 0;
    if (hasErrors) {
      const msgs = (json.errors as unknown[])
        .map((e: unknown) => (e as Record<string, unknown>).message)
        .join("; ");
      throw new Error(`X API returned errors: ${msgs}`);
    }
    throw new Error(
      `X API response missing .data — unexpected structure. Keys: ${Object.keys(json).join(", ")}`,
    );
  }

  const bookmarkTimeline = data?.bookmark_timeline_v2 as Record<string, unknown> | undefined;
  if (!bookmarkTimeline) {
    throw new Error(
      `X API response missing .data.bookmark_timeline_v2 — keys: ${Object.keys(data).join(", ")}`,
    );
  }
  const timeline = bookmarkTimeline?.timeline as Record<string, unknown>;
  const instructions = (timeline?.instructions as unknown[]) ?? [];

  // Extract entries from TimelineAddEntries instructions (match fieldtheory-cli loop)
  const entries: Record<string, unknown>[] = [];
  for (const inst of instructions) {
    const instRecord = inst as Record<string, unknown>;
    if (
      instRecord.type === "TimelineAddEntries" &&
      Array.isArray(instRecord.entries)
    ) {
      entries.push(...(instRecord.entries as Record<string, unknown>[]));
    }
  }

  const records: TweetData[] = [];
  let nextCursor: string | undefined;

  for (const entry of entries) {
    const entryRecord = entry as Record<string, unknown>;

    // Check for cursor
    if (
      typeof entryRecord.entryId === "string" &&
      (entryRecord.entryId as string).startsWith("cursor-bottom")
    ) {
      nextCursor = (entryRecord.content as Record<string, unknown>)
        ?.value as string | undefined;
      continue;
    }

    // Extract tweet result
    const content = entryRecord.content as Record<string, unknown> | undefined;
    const itemContent = content?.itemContent as Record<string, unknown> | undefined;
    const tweetResult = (itemContent?.tweet_results as Record<string, unknown>)
      ?.result ?? itemContent?.tweet_results as
        | Record<string, unknown>
        | undefined;

    if (!tweetResult) continue;

    // Handle BOTH tweet result formats from X API:
    //   Old: { __typename:"Tweet", limitedActionResults, tweet: { legacy, core, ... } }
    //   New (current): { __typename:"Tweet", legacy, core, note_tweet, ... } — flat format
    // The Zod schema expects { tweet: { legacy, core, ... } }, so for the flat format
    // we wrap it to match. This way parseTweet works unchanged.
    const tweetData = (tweetResult as Record<string, unknown>).tweet
      ? tweetResult  // old format: already has tweet wrapper
      : { tweet: tweetResult }; // flat format: wrap it

    const record = parseTweet(tweetData as Record<string, unknown>);
    if (record) records.push(record);
  }

  return { records, nextCursor };
};

// ── Fetch page (GET, matches fieldtheory-cli) ────────────────
const fetchPage = async (
  config: GraphQLConfig,
  cursor: string | undefined,
  attempt: number,
  count: number,
): Promise<{ records: TweetData[]; nextCursor?: string }> => {
  if (attempt >= 4) {
    throw new Error("GraphQL Bookmarks API: all retry attempts failed");
  }

  const url = buildUrl(cursor, count);
  const headers = buildHeaders(config.csrfToken, config.cookieHeader);

  const response = await fetch(url, { headers });

  if (response.status === 429) {
    const retryAfter = response.headers.get("retry-after");
    const seconds = retryAfter ? Number(retryAfter) : Math.min(15 * Math.pow(2, attempt), 120);
    await new Promise((r) => setTimeout(r, seconds * 1000));
    return fetchPage(config, cursor, attempt + 1, count);
  }

  if (response.status >= 500) {
    await new Promise((r) => setTimeout(r, 5000 * (attempt + 1)));
    return fetchPage(config, cursor, attempt + 1, count);
  }

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`GraphQL API ${response.status}: ${text.slice(0, 300)}`);
  }

  const json = (await response.json()) as Record<string, unknown>;
  return parseResponse(json);
};

// ── Recursive fetch all pages (avoids no-await-in-loop) ─────
// Staleness: stops after 2 pages with 0 new tweets
const fetchAllPages = async (
  config: GraphQLConfig,
  limit: number,
  count: number,
  existingIds: Set<string>,
  cursor?: string,
  acc: TweetData[][] = [],
  stalePages = 0,
): Promise<TweetData[][]> => {
  if (acc.flat().length >= limit) return acc;
  if (stalePages >= 2) return acc; // Stop after 2 stale pages

  const { records, nextCursor } = await fetchPage(config, cursor, 0, count);

  // Diagnostic: log what the API is actually returning
  const existingInPage = records.filter((r) => existingIds.has(r.id)).length;
  const newRecords = records.filter((r) => !existingIds.has(r.id));
  const pageIsStale = newRecords.length === 0;

  if (records.length === 0) {
    console.error(`[sync] page returned 0 records (cursor: ${cursor ? cursor.slice(0, 20) + "..." : "initial"})`);
  } else if (existingInPage === records.length) {
    console.error(`[sync] page: ${records.length} records, ALL ${existingInPage} already in DB — likely caught up`);
  } else if (existingInPage > 0) {
    console.error(`[sync] page: ${records.length} records (${existingInPage} existing, ${newRecords.length} new)`);
  } else {
    console.error(`[sync] page: ${records.length} records, all new`);
  }

  const newAcc = [...acc, newRecords];
  const newStalePages = pageIsStale ? stalePages + 1 : 0; // Reset on new tweets

  if (pageIsStale) {
    if (newStalePages >= 2) return newAcc;
  }

  if (!nextCursor) return newAcc;

  // Jitter between requests
  await jitter();

  // Recursive call (no while loop, no lint error)
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

// ── Helper: chunk array ─────────────────────────────────────
const chunk = <T>(arr: T[], size: number): T[][] =>
  Array.from(
    { length: Math.ceil(arr.length / size) },
    (_, i) => arr.slice(i * size, (i + 1) * size),
  );

// ── Public API ────────────────────────────────────────────────
export interface GraphQLConfig {
  csrfToken: string;
  cookieHeader?: string;
}

export const createGraphQL = (): UncheckedSource<GraphQLConfig> => ({
  check: async (config: GraphQLConfig): Promise<CheckedSource> => {
    // Inline validateConfig (was one-line null check, no reason for function call overhead)
    if (!config.csrfToken) throw new Error("GraphQL: csrfToken required");

    // Build URL + headers FIRST, then pass to validation (separate concerns)
    const url = buildUrl(undefined, 1);
    const headers = buildHeaders(config.csrfToken, config.cookieHeader);
    await validateConnectivity(url, headers);

    // Capture config in closure, return CheckedSource
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

// ── Fetch implementations ────────────────────────────────────
const fetchBatchImpl = async (
  config: GraphQLConfig,
  limit: number,
  concurrency: number,
  existingIds: Set<string>,
): Promise<FetchedBatchSource> => {
  // Fetch all pages (recursive, no while+await, with jitter + staleness detection)
  const pages = await fetchAllPages(config, limit, 200, existingIds);
  const allTweets = pages.flat();

  return {
    processBatch: () => Promise.resolve(allTweets),

    processAll: async () => {
      // CORRECT pooledMap usage: pre-existing array + concurrent processing
      const batches = chunk(allTweets, 100);

      const results: TweetData[] = [];
      for await (
        const batch of pooledMap(
          concurrency,
          batches,
          (b: TweetData[]) => Promise.resolve(b), // identity fn (actual processing goes here)
        )
      ) {
        results.push(...batch);
      }

      return results;
    },
  };
};

const fetchOneImpl = (
  _config: GraphQLConfig,
  _id: string,
): Promise<FetchedOneSource> => {
  // Single tweet fetch (endpoint TBD, for now throw at process time)
  return Promise.resolve({
    processOne: () => {
      throw new Error("fetchOne: single-tweet endpoint TBD");
    },
  });
};

/** Pure parse of Bookmarks GraphQL pages: envelope Zod + leaf tweet map. */

import type { TweetData } from "./types.ts";
import {
  BookmarksResponseSchema,
  BookmarkTimelineDataSchema,
  type TimelineEntry,
  type TimelineInstruction,
  TweetDataSchema,
} from "./schema.ts";

/** Per-page parse counts for logging (seen / parsed / skipped). */
export interface ParseStats {
  readonly entriesSeen: number;
  readonly tweetsParsed: number;
  readonly entriesSkipped: number;
}

export interface ParsePageResult {
  readonly records: TweetData[];
  readonly nextCursor: string | undefined;
  readonly stats: ParseStats;
}

const isCursorEntry = (entry: TimelineEntry): boolean =>
  typeof entry.entryId === "string" && entry.entryId.startsWith("cursor-bottom");

const isAddEntries = (
  inst: TimelineInstruction,
): inst is Extract<TimelineInstruction, { type: "TimelineAddEntries" }> =>
  inst.type === "TimelineAddEntries" && "entries" in inst &&
  Array.isArray(inst.entries);

const collectEntries = (instructions: TimelineInstruction[]): TimelineEntry[] =>
  instructions.filter(isAddEntries).flatMap((inst) => inst.entries);

const extractTweetResult = (entry: TimelineEntry): unknown =>
  entry.content?.itemContent?.tweet_results?.result;

/**
 * X returns both flat Tweet and TweetWithVisibilityResults (`{ tweet: ... }`).
 * TweetDataSchema always wants the nested shape.
 */
const wrapTweetPayload = (result: unknown): unknown => {
  if (typeof result !== "object" || result === null) return null;
  if ("tweet" in result) return result;
  return { tweet: result };
};

const mapTweetNode = (tweetResult: unknown): TweetData | null => {
  const payload = wrapTweetPayload(tweetResult);
  if (payload === null) return null;

  const parsed = TweetDataSchema.safeParse(payload);
  if (!parsed.success) return null;

  const tweet = parsed.data.tweet;
  const legacy = tweet.legacy;
  const authorResult = tweet.core.user_results.result;
  const authorCore = authorResult.core;
  const authorLegacy = authorResult.legacy;

  const mediaEntities = legacy.extended_entities?.media ?? legacy.entities?.media ??
    [];
  const media = mediaEntities.map((m) => ({
    type: m.type,
    url: m.media_url_https ?? m.media_url ?? "",
    original_img_url: m.media_info?.original_img_url ?? "",
  }));

  const urlEntities = legacy.entities?.urls ?? [];
  const links = urlEntities
    .map((u) => u.expanded_url)
    .filter((u) => !u.includes("t.co"));

  const noteText = tweet.note_tweet?.note_tweet_results?.result?.text;
  const text = noteText ?? legacy.full_text ?? legacy.text ?? "";

  const viewRaw = tweet.views?.count;
  const viewCount = viewRaw === undefined ? undefined : Number(viewRaw);
  const engagementView = viewCount !== undefined && Number.isFinite(viewCount)
    ? viewCount
    : undefined;

  return {
    id: legacy.id_str,
    text,
    author: {
      screen_name: authorCore.screen_name ?? authorLegacy?.screen_name ?? "",
      name: authorCore.name ?? authorLegacy?.name ?? "",
    },
    created_at: legacy.created_at,
    media: { all: media },
    links_json: JSON.stringify(links),
    engagement: {
      likeCount: legacy.favorite_count,
      repostCount: legacy.retweet_count,
      replyCount: legacy.reply_count,
      quoteCount: legacy.quote_count,
      bookmarkCount: legacy.bookmark_count,
      viewCount: engagementView,
    },
  };
};

const formatZodIssues = (
  err: { issues: readonly { path: PropertyKey[]; message: string }[] },
): string =>
  err.issues
    .map((i) => `${i.path.map(String).join(".") || "(root)"}: ${i.message}`)
    .join("; ");

/**
 * Validate Bookmarks GraphQL JSON and map timeline entries to TweetData.
 * Hard-fails on envelope drift or when tweet_results exist but none parse.
 */
export const parseResponse = (json: unknown): ParsePageResult => {
  const top = BookmarksResponseSchema.safeParse(json);
  if (!top.success) {
    throw new Error(
      `X API response failed envelope schema: ${formatZodIssues(top.error)}`,
    );
  }

  const { data, errors } = top.data;
  const hasErrors = Array.isArray(errors) && errors.length > 0;
  const errorMessages = hasErrors ? errors.map((e) => e.message).join("; ") : "";

  if (data === null || data === undefined) {
    if (hasErrors) {
      throw new Error(`X API returned errors: ${errorMessages}`);
    }
    throw new Error(
      "X API response missing .data -- unexpected structure. " +
        `Keys: ${
          typeof json === "object" && json !== null ? Object.keys(json).join(", ") : typeof json
        }`,
    );
  }

  const timeline = BookmarkTimelineDataSchema.safeParse(data);
  if (!timeline.success) {
    const keys = typeof data === "object" && data !== null
      ? Object.keys(data).join(", ")
      : typeof data;
    throw new Error(
      `X API response missing or invalid .data.bookmark_timeline_v2 ` +
        `(keys: ${keys}): ${formatZodIssues(timeline.error)}`,
    );
  }

  const entries = collectEntries(
    timeline.data.bookmark_timeline_v2.timeline.instructions,
  );

  const nextCursor = entries
    .filter(isCursorEntry)
    .map((e) => e.content?.value)
    .find((v): v is string => typeof v === "string");

  const nonCursor = entries.filter((e) => !isCursorEntry(e));
  const tweetPayloads = nonCursor
    .map((entry) => extractTweetResult(entry))
    .filter((raw) => raw !== undefined && raw !== null);

  const records = tweetPayloads
    .map((raw) => mapTweetNode(raw))
    .filter((r): r is TweetData => r !== null);

  if (tweetPayloads.length > 0 && records.length === 0) {
    throw new Error(
      `GraphQL schema drift: ${tweetPayloads.length} tweet_results ` +
        `entr${tweetPayloads.length === 1 ? "y" : "ies"} but 0 parseable tweets`,
    );
  }

  const entriesSeen = entries.length;
  const tweetsParsed = records.length;
  const entriesSkipped = entriesSeen - tweetsParsed;

  return {
    records,
    nextCursor,
    stats: { entriesSeen, tweetsParsed, entriesSkipped },
  };
};

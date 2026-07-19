/** Per-tweet fetch/save and batch DB write for extract. */

import { CONFIG } from "../../config.ts";
import { fetchThread } from "../../extraction/xtracticle.ts";
import type { Database } from "../../utils/db.ts";
import { logger } from "../../utils/logger.ts";
import { classifyTweet, getEffectiveText } from "./classify.ts";
import { findExistingClipping, saveClipping } from "./clipping.ts";
import { markExtracted, markExtractStatus } from "./db.ts";
import type { BookmarkRow, ExtractItemOutcome, ExtractResult } from "./types.ts";

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

const randomDelay = (): number => CONFIG.extractDelayMs + Math.random() * CONFIG.extractJitterMs;

/** Fetch one tweet, write clipping when content exists, then rate-limit delay. */
export const extractSingle = async (
  row: BookmarkRow,
): Promise<ExtractItemOutcome> => {
  const result = await fetchThread(row.tweet_id);

  if (result.kind === "http_error") {
    logger.error("xtracticle fetch failed", {
      tweet_id: row.tweet_id,
      status: result.status,
    });
    return {
      tweetId: row.tweet_id,
      clippingPath: null,
      extractStatus: result.status === 404 ? "404" : "error",
      skipped: false,
    };
  }

  if (result.kind === "parse_error") {
    logger.error("xtracticle parse failed", {
      tweet_id: row.tweet_id,
      error: result.message,
    });
    return {
      tweetId: row.tweet_id,
      clippingPath: null,
      extractStatus: "error",
      skipped: false,
    };
  }

  if (result.kind === "no_tweets") {
    logger.info("xtracticle returned no tweets", { tweet_id: row.tweet_id });
    return {
      tweetId: row.tweet_id,
      clippingPath: null,
      extractStatus: "no_tweets",
      skipped: false,
    };
  }

  if (result.kind === "empty") {
    return {
      tweetId: row.tweet_id,
      clippingPath: null,
      extractStatus: "empty",
      skipped: false,
    };
  }

  const { tweet } = result;
  const effectiveText = getEffectiveText(tweet);
  if (effectiveText.trim().length === 0) {
    logger.info("xtracticle returned empty text -- skipping", {
      tweet_id: row.tweet_id,
      url: tweet.url,
    });
    return {
      tweetId: row.tweet_id,
      clippingPath: null,
      extractStatus: "empty",
      skipped: false,
    };
  }

  const clippingPath = await saveClipping(tweet);
  logger.info("extracted clipping", {
    tweet_id: row.tweet_id,
    type: classifyTweet(tweet).type,
    path: clippingPath.split("/").pop(),
    textLen: (tweet.text ?? "").length,
  });

  await sleep(randomDelay());
  return {
    tweetId: row.tweet_id,
    clippingPath,
    extractStatus: "extracted",
    skipped: false,
  };
};

/** Concurrent fetch/save for a batch, then sequential DB updates. */
export const processBatch = async (
  db: Database,
  rows: readonly BookmarkRow[],
  skipExisting: boolean,
): Promise<ExtractResult[]> => {
  const fetched = await Promise.all(
    rows.map((row) =>
      (skipExisting ? findExistingClipping(row.tweet_id) : Promise.resolve(null))
        .then((existing) =>
          existing !== null
            ? {
              tweetId: row.tweet_id,
              clippingPath: existing,
              extractStatus: "extracted",
              skipped: true,
            }
            : extractSingle(row)
        )
        .catch((err: unknown) => {
          const msg = err instanceof Error ? err.message : String(err);
          logger.error("extract failed", {
            tweet_id: row.tweet_id,
            error: msg,
          });
          return {
            tweetId: row.tweet_id,
            clippingPath: null,
            extractStatus: "error",
            skipped: false,
          };
        })
    ),
  );

  return fetched.map((item) => {
    if (item.skipped) {
      if (item.clippingPath !== null) {
        markExtracted(db, item.tweetId, item.clippingPath);
      }
      return "skipped";
    }
    if (item.clippingPath !== null) {
      markExtracted(db, item.tweetId, item.clippingPath);
      return "extracted";
    }
    markExtractStatus(db, item.tweetId, item.extractStatus);
    return "failed";
  });
};

/** Count extracted / skipped / failed outcomes. */
export const summarize = (
  results: readonly ExtractResult[],
): { extracted: number; skipped: number; failed: number } => {
  const counts = results.reduce(
    (acc, r) => {
      acc[r] += 1;
      return acc;
    },
    { extracted: 0, skipped: 0, failed: 0 },
  );
  return counts;
};

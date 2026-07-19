/** Sync bookmarks from X via our own GraphQL client.
 *  Replaces shelling out to ft CLI.
 */
import { checkCookies, getCookies } from "./cookies.ts";
import { logger } from "../utils/logger.ts";
import { type Database, getPipelineDb, type Row } from "../utils/db.ts";
import { parseRows, TweetIdRowSchema } from "../utils/db-rows.ts";
import { createGraphQL } from "../extraction/index.ts";
import type { TweetData } from "../extraction/types.ts";

interface SyncOptions {
  maxPages?: number;
  targetAdds?: number;
  maxMinutes?: number;
  rebuild?: boolean;
  continue?: boolean;
  gaps?: boolean;
  dryRun?: boolean;
}

/** Row map for one bookmark upsert. */
const bookmarkUpsertRow = (tweet: TweetData, now: string): Row => ({
  tweet_id: tweet.id,
  url: `https://x.com/${tweet.author.screen_name}/status/${tweet.id}`,
  text: tweet.text,
  author_handle: tweet.author.screen_name,
  author_name: tweet.author.name,
  posted_at: tweet.created_at,
  links_json: tweet.links_json ?? null,
  media_count: tweet.media?.all?.length ?? 0,
  synced_at: now,
});

/**
 * Import tweets with "as many as possible" semantics.
 * Try a chunk in one transaction; on failure bisect until a single bad row is
 * skipped, then continue the rest.
 */
const importChunk = (
  db: Database,
  tweets: readonly TweetData[],
  now: string,
): { readonly imported: number; readonly failedIds: readonly string[] } => {
  if (tweets.length === 0) {
    return { imported: 0, failedIds: [] };
  }

  try {
    db.transaction((tx) => {
      tweets.forEach((tweet) => {
        tx.upsert("bookmarks", bookmarkUpsertRow(tweet, now), ["tweet_id"]);
      });
    });
    return { imported: tweets.length, failedIds: [] };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (tweets.length === 1) {
      const only = tweets[0];
      if (only === undefined) return { imported: 0, failedIds: [] };
      logger.error("skipping bookmark import", {
        tweet_id: only.id,
        error: msg,
      });
      return { imported: 0, failedIds: [only.id] };
    }
    const mid = Math.floor(tweets.length / 2);
    const left = importChunk(db, tweets.slice(0, mid), now);
    const right = importChunk(db, tweets.slice(mid), now);
    return {
      imported: left.imported + right.imported,
      failedIds: [...left.failedIds, ...right.failedIds],
    };
  }
};

/** Insert or update tweets in pipeline.db (import as many as possible). */
const importIntoPipelineDb = (
  tweets: TweetData[],
): { imported: number; failed: number } => {
  const db = getPipelineDb();
  const now = new Date().toISOString();
  const result = importChunk(db, tweets, now);
  if (result.failedIds.length > 0) {
    logger.warn("import completed with skips", {
      imported: result.imported,
      failed: result.failedIds.length,
      failedIds: result.failedIds,
    });
  }
  return { imported: result.imported, failed: result.failedIds.length };
};

/** Load all existing tweet_ids from pipeline.db. */
const getExistingIds = (): Set<string> => {
  const db = getPipelineDb();
  const rows = parseRows(
    TweetIdRowSchema,
    db.select("bookmarks", { columns: ["tweet_id"] }),
  );
  return new Set(rows.map((r) => r.tweet_id));
};

export const runSync = async (
  password: string | undefined,
  options: SyncOptions,
): Promise<void> => {
  logger.info("sync started", { dryRun: options.dryRun });

  if (options.dryRun) {
    logger.info("dry run -- skipping sync");
    return;
  }

  const hasCookies = await checkCookies();
  if (!hasCookies) {
    throw new Error("No cookies file. Run: ft-pipeline cookies extract");
  }

  if (!password) {
    throw new Error(
      "Password required (use --password or FT_PIPELINE_PASSWORD env)",
    );
  }

  logger.info("decrypting X session cookies");
  const cookies = await getCookies(password);
  const csrfToken = cookies.ct0;
  const cookieHeader = `ct0=${csrfToken}; auth_token=${cookies.authToken}`;

  if (!options.rebuild) {
    logger.info("querying existing tweet IDs from DB");
  }
  const existingIds = options.rebuild ? new Set<string>() : getExistingIds();
  logger.info("existing tweet count", { count: existingIds.size });

  logger.info("initializing GraphQL client");
  const unchecked = createGraphQL();

  logger.info("checking GraphQL API connectivity");
  const checked = await unchecked.check({
    csrfToken,
    cookieHeader,
  });

  logger.info("fetching bookmarks from X API");
  const fetched = await checked.fetchBatch(
    1000, // limit
    3, // concurrency
    existingIds, // skip existing
  );

  logger.info("processing fetched tweets");
  const tweets = await fetched.processBatch();

  if (tweets.length === 0) {
    logger.info("no new bookmarks to import -- all caught up");
    return;
  }

  logger.info("importing into pipeline DB", { count: tweets.length });
  const { imported, failed } = importIntoPipelineDb(tweets);
  logger.info("import complete", { imported, failed });
};

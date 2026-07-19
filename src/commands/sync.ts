/** Sync bookmarks from X via our own GraphQL client.
 *  Replaces shelling out to ft CLI.
 */
import { checkCookies, getCookies } from "./cookies.ts";
import { logger } from "../utils/logger.ts";
import { getPipelineDb } from "../utils/db.ts";
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

/** Insert or update tweets in pipeline.db. */
const importIntoTipelineDb = (
  tweets: TweetData[],
): { imported: number; updated: number } => {
  const db = getPipelineDb();
  const now = new Date().toISOString();
  let imported = 0;

  db.transaction((tx) => {
    tweets.forEach((tweet) => {
      tx.upsert(
        "bookmarks",
        {
          tweet_id: tweet.id,
          url: `https://x.com/${tweet.author.screen_name}/status/${tweet.id}`,
          text: tweet.text,
          author_handle: tweet.author.screen_name,
          author_name: tweet.author.name,
          posted_at: tweet.created_at,
          links_json: tweet.links_json ?? null,
          media_count: tweet.media?.all?.length ?? 0,
          synced_at: now,
        },
        ["tweet_id"],
      );
      imported++;
    });
  });

  return { imported, updated: 0 };
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
  const { imported } = importIntoTipelineDb(tweets);
  logger.info("import complete", { imported });
};

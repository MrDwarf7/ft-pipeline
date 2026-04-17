// commands/classify-db.ts -- DB operations for classification

import { Database } from "https://deno.land/x/sqlite3@0.12.0/mod.ts";
import { logger } from "../utils/logger.ts";
import { type ClassificationResult } from "./classify-llm.ts";

export interface Row {
  tweet_id: string;
  text: string;
  author_handle: string;
  article_text: string | null;
  clippings_text: string | null;
}

export const queryUnclassified = (db: Database, limit?: number): Row[] =>
  db
    .prepare(`
    SELECT tweet_id, text, author_handle, article_text, clippings_text
    FROM bookmarks
    WHERE our_primary_type IS NULL
    ORDER BY posted_at DESC
    ${limit ? `LIMIT ${limit}` : ""}
  `)
    .all<Row>();

export const dryRunPreview = (rows: Row[]) => {
  logger.info("dry run — showing first 5 unclassified bookmarks", { total: rows.length });
  rows
    .slice(0, 5)
    .forEach((row) =>
      logger.info(`  [${row.tweet_id}] ${row.text.slice(0, 80)}...`, {
        author: row.author_handle,
      }),
    );
};

export const markShortTweet = (db: Database, tweetId: string) => {
  const now = new Date().toISOString();
  db.prepare(`
    UPDATE bookmarks SET
      our_type = ?,
      our_primary_type = ?,
      our_domains = ?,
      our_primary_domain = ?,
      our_classified_at = ?,
      our_confidence = ?
    WHERE tweet_id = ?
  `).run(
    '["meme-shitpost"]',
    "meme-shitpost",
    '["culture"]',
    "culture",
    now,
    0.1,
    tweetId,
  );
};

export const saveClassification = (
  db: Database,
  tweetId: string,
  result: ClassificationResult,
) => {
  const now = new Date().toISOString();
  db.prepare(`
    UPDATE bookmarks SET
      our_type = ?,
      our_primary_type = ?,
      our_domains = ?,
      our_primary_domain = ?,
      our_classified_at = ?,
      our_confidence = ?
    WHERE tweet_id = ?
  `).run(
    JSON.stringify(result.types),
    result.primary_type,
    JSON.stringify(result.domains),
    result.primary_domain,
    now,
    result.confidence,
    tweetId,
  );
};

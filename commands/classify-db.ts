// commands/classify-db.ts -- DB operations for classification
// B2: change these to write to our_* columns

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
    WHERE primary_category = 'unclassified' OR primary_category IS NULL
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

export const markShortTweet = (db: Database, tweetId: string) =>
  db
    .prepare(
      "UPDATE bookmarks SET primary_category = ?, primary_domain = ?, classification_confidence = 0.1 WHERE tweet_id = ?",
    )
    .run("meme-shitpost", "culture", tweetId);

export const saveClassification = (
  db: Database,
  tweetId: string,
  result: ClassificationResult,
) =>
  db
    .prepare(`
    UPDATE bookmarks SET
      primary_category = ?,
      primary_domain = ?,
      classification_confidence = ?
    WHERE tweet_id = ?
  `)
    .run(
      result.primary_type,
      result.primary_domain,
      result.confidence,
      tweetId,
    );

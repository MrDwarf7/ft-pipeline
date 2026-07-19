/** DB operations for classification. Writes to our pipeline.db (NOT ft's
 *  bookmarks.db).
 */

import { type Database } from "../utils/db.ts";
import {
  type ClassifyUnclassifiedRow,
  ClassifyUnclassifiedRowSchema,
  parseRows,
} from "../utils/db-rows.ts";
import { logger } from "../utils/logger.ts";
import { type ClassificationResult } from "./classify-llm.ts";

export type Row = ClassifyUnclassifiedRow;

export const queryUnclassified = (db: Database, limit?: number): Row[] => {
  const baseSql = `
    SELECT tweet_id, text, author_handle, clippings_text
    FROM bookmarks
    WHERE primary_type IS NULL
    ORDER BY posted_at DESC
  `;
  const raw = limit === undefined
    ? db.prepare(baseSql).all()
    : db.prepare(`${baseSql} LIMIT ?`).all(limit);
  return parseRows(ClassifyUnclassifiedRowSchema, raw);
};

export const dryRunPreview = (rows: Row[]) => {
  logger.info("dry run -- showing first 5 unclassified bookmarks", {
    total: rows.length,
  });
  rows.slice(0, 5).forEach((row) =>
    logger.info(`  [${row.tweet_id}] ${row.text.slice(0, 80)}...`, {
      author: row.author_handle,
    })
  );
};

export const markShortTweet = (db: Database, tweetId: string) => {
  const now = new Date().toISOString();
  db.update(
    "bookmarks",
    {
      types: '["meme-shitpost"]',
      primary_type: "meme-shitpost",
      domains: '["culture"]',
      primary_domain: "culture",
      classified_at: now,
      confidence: 0.1,
    },
    { tweet_id: tweetId },
  );
};

export const saveClassification = (
  db: Database,
  tweetId: string,
  result: ClassificationResult,
) => {
  const now = new Date().toISOString();
  db.update(
    "bookmarks",
    {
      types: JSON.stringify(result.types),
      primary_type: result.primary_type,
      domains: JSON.stringify(result.domains),
      primary_domain: result.primary_domain,
      classified_at: now,
      confidence: result.confidence,
    },
    { tweet_id: tweetId },
  );
};

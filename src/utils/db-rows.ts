/** Zod schemas for sqlite3 .mode json rows at command boundaries. */

import { z } from "zod";

/** TEXT: JSON null becomes empty string for callers that always treat it as text. */
export const sqlText = z.union([z.string(), z.null()]).transform((v) => v ?? "");

/** INTEGER: JSON null becomes 0. */
export const sqlInt = z.union([z.number(), z.null()]).transform((v) => v ?? 0);

/** REAL/INTEGER that may remain null (e.g. confidence). */
export const sqlNumberNull = z.union([z.number(), z.null()]);

/** TEXT that may remain null (e.g. clippings_text, JSON blobs). */
export const sqlTextNull = z.union([z.string(), z.null()]);

/** tweet_id primary-key projection. */
export const TweetIdRowSchema = z
  .object({
    tweet_id: z.string(),
  })
  .passthrough();

export type TweetIdRow = z.infer<typeof TweetIdRowSchema>;

/** Unclassified rows for the classify command. */
export const ClassifyUnclassifiedRowSchema = z.object({
  tweet_id: z.string(),
  text: sqlText,
  author_handle: sqlText,
  clippings_text: sqlTextNull,
});

export type ClassifyUnclassifiedRow = z.infer<typeof ClassifyUnclassifiedRowSchema>;

/** Pending extract rows (links or media present). */
export const ExtractPendingRowSchema = z.object({
  tweet_id: z.string(),
  url: sqlText,
  text: sqlText,
  author_handle: sqlText,
  links_json: z.union([z.string(), z.null()]).transform((v) => v ?? "[]"),
  media_count: sqlInt,
});

export type ExtractPendingRow = z.infer<typeof ExtractPendingRowSchema>;

/** Generate-command SELECT projection (COALESCE aliases included). */
export const GenerateBookmarkRowSchema = z.object({
  tweet_id: z.string(),
  url: sqlText,
  text: sqlText,
  display_text: sqlText,
  author_handle: sqlText,
  author_name: sqlText,
  posted_at: sqlText,
  primary_type: sqlText,
  primary_domain: sqlText,
  types_raw: sqlTextNull,
  domains_raw: sqlTextNull,
  confidence: sqlNumberNull,
  content_type: sqlText,
  media_count: sqlInt,
});

export type GenerateBookmarkRow = z.infer<typeof GenerateBookmarkRowSchema>;

/** Indexes query: classified bookmarks with author handle. */
export const IndexBookmarkRowSchema = z.object({
  tweet_id: z.string(),
  text: sqlText,
  author_handle: sqlText,
  author_name: sqlText,
  posted_at: sqlText,
  primary_type: sqlText,
  primary_domain: sqlText,
  likes: sqlInt,
  display_text: sqlText,
});

export type IndexBookmarkRow = z.infer<typeof IndexBookmarkRowSchema>;

/** COUNT(*) AS cnt aggregate row. */
export const CountRowSchema = z
  .object({
    cnt: z.number(),
  })
  .passthrough();

export type CountRow = z.infer<typeof CountRowSchema>;

/** name column (migration_runs / PRAGMA table_info). */
export const NameRowSchema = z
  .object({
    name: z.string(),
  })
  .passthrough();

export type NameRow = z.infer<typeof NameRowSchema>;

/** Parse each JSON row with schema; throws on first invalid shape. */
export const parseRows = <S extends z.ZodType>(
  schema: S,
  rows: readonly unknown[],
): z.infer<S>[] => rows.map((row) => schema.parse(row));

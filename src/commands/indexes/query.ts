/** DB load for index generation. */

import type { Database } from "../../utils/db.ts";
import { IndexBookmarkRowSchema, parseRows } from "../../utils/db-rows.ts";
import type { BookmarkEntry } from "./types.ts";

/** Load classified bookmarks with non-empty author handles. */
export const queryBookmarks = (db: Database): BookmarkEntry[] => {
  const raw = db
    .prepare(`
    SELECT tweet_id, text, author_handle, author_name, posted_at,
           primary_type, primary_domain,
           0 as likes,
           COALESCE(clippings_text, text) as display_text
    FROM bookmarks
    WHERE primary_type IS NOT NULL
      AND (author_handle IS NOT NULL AND author_handle != '')
    ORDER BY posted_at DESC
  `)
    .all();
  return parseRows(IndexBookmarkRowSchema, raw);
};

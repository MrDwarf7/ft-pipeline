/** DB query and status updates for extract. */

import type { Database } from "../../utils/db.ts";
import type { BookmarkRow } from "./types.ts";

/** Bookmarks still needing extraction (null path / error status + links or media). */
export const queryPendingRows = (
  db: Database,
  limit: number | undefined,
): BookmarkRow[] => {
  const limitSql = typeof limit === "number" ? `LIMIT ${limit}` : "";
  return db
    .prepare(`
    SELECT tweet_id, url, text, author_handle, links_json, media_count
    FROM bookmarks
    WHERE (clipping_path IS NULL OR clipping_path = '')
      AND (extract_status IS NULL OR extract_status = 'error')
      AND (links_json IS NOT NULL AND links_json != '[]'
           OR COALESCE(media_count, 0) > 0)
    ORDER BY posted_at DESC
    ${limitSql}
  `)
    .all<BookmarkRow>();
};

/** Mark bookmark as extracted with clipping path. */
export const markExtracted = (
  db: Database,
  tweetId: string,
  clippingPath: string,
): void => {
  db.update(
    "bookmarks",
    {
      clipping_path: clippingPath,
      extract_status: "extracted",
    },
    { tweet_id: tweetId },
  );
};

/** Persist a non-success extract_status (empty / 404 / no_tweets / error). */
export const markExtractStatus = (
  db: Database,
  tweetId: string,
  extractStatus: string,
): void => {
  db.update(
    "bookmarks",
    { extract_status: extractStatus },
    { tweet_id: tweetId },
  );
};

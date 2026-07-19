/** Generate category/domain/entity index notes with hash-based caching. */

import { logger } from "../utils/logger.ts";
import { closePipelineDb, getPipelineDb } from "../utils/db.ts";
import { queryBookmarks } from "./indexes/query.ts";
import { buildIndexGroups } from "./indexes/view.ts";
import { writeAllIndexes } from "./indexes/write.ts";

export type { BookmarkEntry, IndexGroups, LinkType, PageSection } from "./indexes/types.ts";
export { queryBookmarks } from "./indexes/query.ts";
export { buildIndexGroups, ENTITY_THRESHOLD, topEntities } from "./indexes/view.ts";
export {
  renderCategoryPage,
  renderDomainPage,
  renderEntityPage,
  renderMasterIndex,
} from "./indexes/render.ts";
export { writeAllIndexes } from "./indexes/write.ts";

/** Load classified bookmarks, group them, and write hash-cached index pages. */
export const runIndexes = async (): Promise<void> => {
  logger.info("indexes started");

  const db = getPipelineDb();
  try {
    const bookmarks = queryBookmarks(db);
    logger.info("bookmarks to index", { count: bookmarks.length });

    const groups = buildIndexGroups(bookmarks);
    await writeAllIndexes(bookmarks.length, groups);
  } finally {
    closePipelineDb();
  }

  logger.info("indexes complete");
};

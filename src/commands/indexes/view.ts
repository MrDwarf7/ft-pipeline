/** Pure view-model grouping for index pages. */

import type { BookmarkEntry, IndexGroups } from "./types.ts";

/** Min bookmark count before an author gets an entity page. */
export const ENTITY_THRESHOLD = 5;

const groupBy = <T>(
  items: T[],
  key: (item: T) => string,
): Record<string, T[]> =>
  items.reduce(
    (acc, item) => {
      const k = key(item);
      return { ...acc, [k]: [...(acc[k] || []), item] };
    },
    {} as Record<string, T[]>,
  );

/** Group bookmarks by type, domain, and author for page writers. */
export const buildIndexGroups = (bookmarks: BookmarkEntry[]): IndexGroups => ({
  byCategory: groupBy(
    bookmarks,
    (b) => b.primary_type || "unclassified",
  ),
  byDomain: groupBy(
    bookmarks,
    (b) => b.primary_domain || "uncategorized",
  ),
  byAuthor: groupBy(bookmarks, (b) => b.author_handle),
});

/** Authors with enough bookmarks for entity pages, sorted by count desc. */
export const topEntities = (
  byAuthor: Record<string, BookmarkEntry[]>,
  limit: number,
): [string, BookmarkEntry[]][] =>
  Object.entries(byAuthor)
    .filter(([_, entries]) => entries.length >= ENTITY_THRESHOLD)
    .sort((a, b) => b[1].length - a[1].length)
    .slice(0, limit);

// commands/indexes.ts -- Generate category/domain index notes

import { Database } from "https://deno.land/x/sqlite3@0.12.0/mod.ts";
import { CONFIG, DOMAINS, TYPES } from "../config.ts";
import { logger } from "../utils/logger.ts";

interface BookmarkEntry {
  tweet_id: string;
  text: string;
  display_text: string;
  author_handle: string;
  author_name: string;
  posted_at: string;
  our_primary_type: string;
  our_primary_domain: string;
  likes: number;
}

export const runIndexes = async (): Promise<void> => {
  logger.info("indexes started");

  const db = new Database(CONFIG.dbPath);
  try {
    const bookmarks = db.prepare(`
      SELECT tweet_id, text, author_handle, author_name, posted_at,
             our_primary_type, our_primary_domain,
             COALESCE(like_count, 0) as likes,
             COALESCE(clippings_text, text) as display_text
      FROM bookmarks
      WHERE our_primary_type IS NOT NULL
      ORDER BY posted_at DESC
    `).all<BookmarkEntry>();

    logger.info("bookmarks to index", { count: bookmarks.length });

    // Group by category/domain using reduce
    const byCategory = bookmarks.reduce(
      (acc, b) => {
        const cat = b.our_primary_type || "unclassified";
        return { ...acc, [cat]: [...(acc[cat] || []), b] };
      },
      {} as Record<string, BookmarkEntry[]>,
    );

    const byDomain = bookmarks.reduce(
      (acc, b) => {
        const dom = b.our_primary_domain || "uncategorized";
        return { ...acc, [dom]: [...(acc[dom] || []), b] };
      },
      {} as Record<string, BookmarkEntry[]>,
    );

    // Generate category index pages
    const categoriesDir = `${CONFIG.mdOutputDir}/categories`;
    await Deno.mkdir(categoriesDir, { recursive: true });

    const writeCategoryPage = async ([category, entries]: [
      string,
      BookmarkEntry[],
    ]) => {
      const topByLikes = entries
        .toSorted((a, b) => b.likes - a.likes)
        .slice(0, 50);

      const content = `---
type: index
category: ${category}
count: ${entries.length}
updated: ${new Date().toISOString()}
---

# ${category}

${entries.length} bookmarks in this category.

## Top by Engagement

${topByLikes.map((e) => formatBookmarkLine(e, "category")).join("\n\n")}

## Recent

${entries.slice(0, 20).map((e) => formatBookmarkLine(e, "category")).join("\n\n")}

## Related Domains
${[...new Set(entries.map((e) => e.our_primary_domain))].map((d) => `- [[domains/${d}]]`).join("\n")}

## Top Authors
${[...new Set(entries.map((e) => e.author_handle))].slice(0, 20).map((h) => `- [[entities/${h}]]`).join("\n")}
`;

      await Deno.writeTextFile(`${categoriesDir}/${category}.md`, content);
      logger.info("category index written", { category, count: entries.length });
    };

    await Promise.all(Object.entries(byCategory).map(writeCategoryPage));

    // Generate domain index pages
    const domainsDir = `${CONFIG.mdOutputDir}/domains`;
    await Deno.mkdir(domainsDir, { recursive: true });

    const writeDomainPage = async ([domain, entries]: [
      string,
      BookmarkEntry[],
    ]) => {
      const topByLikes = entries
        .toSorted((a, b) => b.likes - a.likes)
        .slice(0, 50);

      const content = `---
type: index
domain: ${domain}
count: ${entries.length}
updated: ${new Date().toISOString()}
---

# ${domain}

${entries.length} bookmarks in this domain.

## Top by Engagement

${topByLikes.map((e) => formatBookmarkLine(e, "domain")).join("\n\n")}

## Recent

${entries.slice(0, 20).map((e) => formatBookmarkLine(e, "domain")).join("\n\n")}

## Related Categories
${[...new Set(entries.map((e) => e.our_primary_type))].map((c) => `- [[categories/${c}]]`).join("\n")}

## Top Authors
${[...new Set(entries.map((e) => e.author_handle))].slice(0, 20).map((h) => `- [[entities/${h}]]`).join("\n")}
`;

      await Deno.writeTextFile(`${domainsDir}/${domain}.md`, content);
      logger.info("domain index written", { domain, count: entries.length });
    };

    await Promise.all(Object.entries(byDomain).map(writeDomainPage));

    // Generate entity pages (authors with 5+ bookmarks)
    const entityDir = `${CONFIG.mdOutputDir}/entities`;
    await Deno.mkdir(entityDir, { recursive: true });

    const ENTITY_THRESHOLD = 5;

    const byAuthor = bookmarks.reduce(
      (acc, b) => {
        return { ...acc, [b.author_handle]: [...(acc[b.author_handle] || []), b] };
      },
      {} as Record<string, BookmarkEntry[]>,
    );

    const writeEntityPage = async ([handle, entries]: [string, BookmarkEntry[]]) => {
      if (entries.length < ENTITY_THRESHOLD) return;

      const topByLikes = entries.toSorted((a, b) => b.likes - a.likes).slice(0, 50);
      const authorName = entries[0]?.author_name || handle;

      const categories = [...new Set(entries.map((e) => e.our_primary_type))];
      const domains = [...new Set(entries.map((e) => e.our_primary_domain))];

      const content = `---
type: entity
author: @${handle}
author_name: "${authorName}"
count: ${entries.length}
updated: ${new Date().toISOString()}
---

# @${handle} — ${authorName}

${entries.length} bookmarks from this author.

## Top by Engagement

${topByLikes.map((e) => formatBookmarkLine(e, "domain")).join("\n\n")}

## Recent

${entries.slice(0, 20).map((e) => formatBookmarkLine(e, "domain")).join("\n\n")}

## Categories
${categories.map((c) => `- [[categories/${c}]]`).join("\n")}

## Domains
${domains.map((d) => `- [[domains/${d}]]`).join("\n")}
`;

      await Deno.writeTextFile(`${entityDir}/${handle}.md`, content);
      logger.info("entity page written", { handle, count: entries.length });
    };

    await Promise.all(Object.entries(byAuthor).map(writeEntityPage));

    // Generate master index
    const topEntities = Object.entries(byAuthor)
      .filter(([_, entries]) => entries.length >= ENTITY_THRESHOLD)
      .sort((a, b) => b[1].length - a[1].length)
      .slice(0, 50);

    const masterContent = `---
type: index
updated: ${new Date().toISOString()}
---

# Bookmark Index

Total: ${bookmarks.length} bookmarks

## By Category

${TYPES.map((t) => `- [[categories/${t}|${t}]] (${byCategory[t]?.length || 0})`).join("\n")}

## By Domain

${DOMAINS.map((d) => `- [[domains/${d}|${d}]] (${byDomain[d]?.length || 0})`).join("\n")}

## Top Entities

${topEntities.map(([handle, entries]) =>
  `- [[entities/${handle}|@${handle}]] (${entries.length})`
).join("\n")}
`;

    await Deno.writeTextFile(`${CONFIG.mdOutputDir}/index.md`, masterContent);
    logger.info("master index written");
  } finally {
    db.close();
  }

  logger.info("indexes complete");
};

type LinkType = "category" | "domain";

const formatBookmarkLine = (b: BookmarkEntry, linkType: LinkType): string => {
  const date = b.posted_at ? new Date(b.posted_at).toISOString().split("T")[0] : "unknown";
  const linkTarget = linkType === "category" ? b.our_primary_type : b.our_primary_domain;
  const textPreview = b.display_text.length > 120
    ? b.display_text.slice(0, 120) + "..."
    : b.display_text;
  const escapedText = textPreview.replace(/\n/g, " ");

  return `- **@${b.author_handle}** (${date}) -- ${escapedText}
  [[${linkType}s/${linkTarget}]] | [[entities/${b.author_handle}]] | [Original](https://x.com/i/status/${b.tweet_id})${
    b.likes > 100 ? ` | ❤️ ${b.likes}` : ""
  }`;
};

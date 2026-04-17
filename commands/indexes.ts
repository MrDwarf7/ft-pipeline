// commands/indexes.ts -- Generate category/domain index notes

import { Database } from "https://deno.land/x/sqlite3@0.12.0/mod.ts";
import { CONFIG, DOMAINS, TYPES } from "../config.ts";
import { logger } from "../utils/logger.ts";

interface BookmarkEntry {
  tweet_id: string;
  text: string;
  author_handle: string;
  author_name: string;
  posted_at: string;
  primary_category: string;
  primary_domain: string;
  likes: number;
}

export const runIndexes = async (): Promise<void> => {
  logger.info("indexes started");

  const db = new Database(CONFIG.dbPath);
  try {
    const bookmarks = db.prepare(`
      SELECT tweet_id, text, author_handle, author_name, posted_at,
             primary_category, primary_domain, 
             COALESCE(like_count, 0) as likes
      FROM bookmarks
      WHERE primary_category IS NOT NULL AND primary_category != 'unclassified'
      ORDER BY posted_at DESC
    `).all<BookmarkEntry>();

    logger.info("bookmarks to index", { count: bookmarks.length });

    // Group by category/domain using reduce
    const byCategory = bookmarks.reduce(
      (acc, b) => {
        const cat = b.primary_category || "unclassified";
        return { ...acc, [cat]: [...(acc[cat] || []), b] };
      },
      {} as Record<string, BookmarkEntry[]>,
    );

    const byDomain = bookmarks.reduce(
      (acc, b) => {
        const dom = b.primary_domain || "uncategorized";
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
`;

      await Deno.writeTextFile(`${domainsDir}/${domain}.md`, content);
      logger.info("domain index written", { domain, count: entries.length });
    };

    await Promise.all(Object.entries(byDomain).map(writeDomainPage));

    // Generate master index
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
  const linkTarget = linkType === "category" ? b.primary_category : b.primary_domain;
  const textPreview = b.text.length > 120 ? b.text.slice(0, 120) + "..." : b.text;
  const escapedText = textPreview.replace(/\n/g, " ");

  return `- **@${b.author_handle}** (${date}) -- ${escapedText}
  [${linkTarget}] | [Original](https://x.com/i/status/${b.tweet_id})${
    b.likes > 100 ? ` | ❤️ ${b.likes}` : ""
  }`;
};

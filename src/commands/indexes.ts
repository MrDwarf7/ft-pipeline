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
  primary_type: string;
  primary_domain: string;
  likes: number;
}

type LinkType = "category" | "domain";

// -- DB --

const queryBookmarks = (db: Database): BookmarkEntry[] =>
  db.prepare(`
    SELECT tweet_id, text, author_handle, author_name, posted_at,
           primary_type, primary_domain,
           0 as likes,
           COALESCE(clippings_text, text) as display_text
    FROM bookmarks
    WHERE primary_type IS NOT NULL
    ORDER BY posted_at DESC
  `).all<BookmarkEntry>();

// -- Grouping --

const groupBy = <T>(items: T[], key: (item: T) => string): Record<string, T[]> =>
  items.reduce(
    (acc, item) => {
      const k = key(item);
      return { ...acc, [k]: [...(acc[k] || []), item] };
    },
    {} as Record<string, T[]>,
  );

// -- Formatting --

const formatBookmarkLine = (b: BookmarkEntry, linkType: LinkType): string => {
  const date = b.posted_at ? new Date(b.posted_at).toISOString().split("T")[0] : "unknown";
  const linkTarget = linkType === "category" ? b.primary_type : b.primary_domain;
  const textPreview = b.display_text.length > 120
    ? b.display_text.slice(0, 120) + "..."
    : b.display_text;
  const escapedText = textPreview.replace(/\n/g, " ");

  return `- **@${b.author_handle}** (${date}) -- ${escapedText}
  [[${linkType}s/${linkTarget}]] | [[entities/${b.author_handle}]] | [Original](https://x.com/i/status/${b.tweet_id})${
    b.likes > 100 ? ` | ❤️ ${b.likes}` : ""
  }`;
};

// -- Page builders --

interface PageSection {
  heading: string;
  body: string;
}

const buildBookmarkSections = (
  entries: BookmarkEntry[],
  linkType: LinkType,
): PageSection[] => {
  const topByLikes = entries.toSorted((a, b) => b.likes - a.likes).slice(0, 50);
  return [
    { heading: "Top by Engagement", body: topByLikes.map((e) => formatBookmarkLine(e, linkType)).join("\n\n") },
    { heading: "Recent", body: entries.slice(0, 20).map((e) => formatBookmarkLine(e, linkType)).join("\n\n") },
  ];
};

const renderPage = (title: string, frontmatter: string, sections: PageSection[]): string =>
  `---\n${frontmatter}---\n\n# ${title}\n\n${
    sections.map((s) => `## ${s.heading}\n\n${s.body}`).join("\n\n")
  }`;

// -- Page writers --

const writeCategoryPages = async (byCategory: Record<string, BookmarkEntry[]>): Promise<void> => {
  const dir = `${CONFIG.mdOutputDir}/categories`;
  await Deno.mkdir(dir, { recursive: true });

  await Promise.all(Object.entries(byCategory).map(async ([category, entries]) => {
    const sections = [
      ...buildBookmarkSections(entries, "category"),
      {
        heading: "Related Domains",
        body: [...new Set(entries.map((e) => e.primary_domain))].map((d) => `- [[domains/${d}]]`).join("\n"),
      },
      {
        heading: "Top Authors",
        body: [...new Set(entries.map((e) => e.author_handle))].slice(0, 20)
          .map((h) => `- [[entities/${h}]]`).join("\n"),
      },
    ];

    const content = renderPage(
      category,
      `type: index\ncategory: ${category}\ncount: ${entries.length}\nupdated: ${new Date().toISOString()}\n`,
      [{ heading: "", body: `${entries.length} bookmarks in this category.` }, ...sections],
    );

    await Deno.writeTextFile(`${dir}/${category}.md`, content);
    logger.info("category index written", { category, count: entries.length });
  }));
};

const writeDomainPages = async (byDomain: Record<string, BookmarkEntry[]>): Promise<void> => {
  const dir = `${CONFIG.mdOutputDir}/domains`;
  await Deno.mkdir(dir, { recursive: true });

  await Promise.all(Object.entries(byDomain).map(async ([domain, entries]) => {
    const sections = [
      ...buildBookmarkSections(entries, "domain"),
      {
        heading: "Related Categories",
        body: [...new Set(entries.map((e) => e.primary_type))].map((c) => `- [[categories/${c}]]`).join("\n"),
      },
      {
        heading: "Top Authors",
        body: [...new Set(entries.map((e) => e.author_handle))].slice(0, 20)
          .map((h) => `- [[entities/${h}]]`).join("\n"),
      },
    ];

    const content = renderPage(
      domain,
      `type: index\ndomain: ${domain}\ncount: ${entries.length}\nupdated: ${new Date().toISOString()}\n`,
      [{ heading: "", body: `${entries.length} bookmarks in this domain.` }, ...sections],
    );

    await Deno.writeTextFile(`${dir}/${domain}.md`, content);
    logger.info("domain index written", { domain, count: entries.length });
  }));
};

const ENTITY_THRESHOLD = 5;

const writeEntityPages = async (byAuthor: Record<string, BookmarkEntry[]>): Promise<void> => {
  const dir = `${CONFIG.mdOutputDir}/entities`;
  await Deno.mkdir(dir, { recursive: true });

  await Promise.all(Object.entries(byAuthor).map(async ([handle, entries]) => {
    if (entries.length < ENTITY_THRESHOLD) return;

    const authorName = entries[0]?.author_name || handle;
    const categories = [...new Set(entries.map((e) => e.primary_type))];
    const domains = [...new Set(entries.map((e) => e.primary_domain))];

    const sections = [
      ...buildBookmarkSections(entries, "domain"),
      { heading: "Categories", body: categories.map((c) => `- [[categories/${c}]]`).join("\n") },
      { heading: "Domains", body: domains.map((d) => `- [[domains/${d}]]`).join("\n") },
    ];

    const content = renderPage(
      `@${handle} — ${authorName}`,
      `type: entity\nauthor: @${handle}\nauthor_name: "${authorName}"\ncount: ${entries.length}\nupdated: ${new Date().toISOString()}\n`,
      [{ heading: "", body: `${entries.length} bookmarks from this author.` }, ...sections],
    );

    await Deno.writeTextFile(`${dir}/${handle}.md`, content);
    logger.info("entity page written", { handle, count: entries.length });
  }));
};

const writeMasterIndex = async (
  totalBookmarks: number,
  byCategory: Record<string, BookmarkEntry[]>,
  byDomain: Record<string, BookmarkEntry[]>,
  byAuthor: Record<string, BookmarkEntry[]>,
): Promise<void> => {
  const topEntities = Object.entries(byAuthor)
    .filter(([_, entries]) => entries.length >= ENTITY_THRESHOLD)
    .sort((a, b) => b[1].length - a[1].length)
    .slice(0, 50);

  const content = `---\ntype: index\nupdated: ${new Date().toISOString()}\n---\n\n# Bookmark Index\n\nTotal: ${totalBookmarks} bookmarks\n\n## By Category\n\n${
    TYPES.map((t) => `- [[categories/${t}|${t}]] (${byCategory[t]?.length || 0})`).join("\n")
  }\n\n## By Domain\n\n${
    DOMAINS.map((d) => `- [[domains/${d}|${d}]] (${byDomain[d]?.length || 0})`).join("\n")
  }\n\n## Top Entities\n\n${
    topEntities.map(([handle, entries]) =>
      `- [[entities/${handle}|@${handle}]] (${entries.length})`
    ).join("\n")
  }\n`;

  await Deno.writeTextFile(`${CONFIG.mdOutputDir}/index.md`, content);
  logger.info("master index written");
};

// -- Main --

export const runIndexes = async (): Promise<void> => {
  logger.info("indexes started");

  const db = new Database(CONFIG.pipelineDbPath);
  try {
    const bookmarks = queryBookmarks(db);
    logger.info("bookmarks to index", { count: bookmarks.length });

    const byCategory = groupBy(bookmarks, (b) => b.primary_type || "unclassified");
    const byDomain = groupBy(bookmarks, (b) => b.primary_domain || "uncategorized");
    const byAuthor = groupBy(bookmarks, (b) => b.author_handle);

    await writeCategoryPages(byCategory);
    await writeDomainPages(byDomain);
    await writeEntityPages(byAuthor);
    await writeMasterIndex(bookmarks.length, byCategory, byDomain, byAuthor);
  } finally {
    db.close();
  }

  logger.info("indexes complete");
};

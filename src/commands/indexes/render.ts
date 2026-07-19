/** Pure markdown render for category, domain, entity, and master index pages. */

import { DOMAINS, TYPES } from "../../config.ts";
import { parseDate } from "../../utils/datetime.ts";
import { topEntities } from "./view.ts";
import type { BookmarkEntry, LinkType, PageSection } from "./types.ts";

const formatBookmarkLine = (b: BookmarkEntry, linkType: LinkType): string => {
  const date = parseDate(b.posted_at).parts.iso.split("T")[0];
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

const buildBookmarkSections = (
  entries: BookmarkEntry[],
  linkType: LinkType,
): PageSection[] => {
  const topByLikes = entries.toSorted((a, b) => b.likes - a.likes).slice(0, 50);
  return [
    {
      heading: "Top by Engagement",
      body: topByLikes.map((e) => formatBookmarkLine(e, linkType)).join("\n\n"),
    },
    {
      heading: "Recent",
      body: entries
        .slice(0, 20)
        .map((e) => formatBookmarkLine(e, linkType))
        .join("\n\n"),
    },
  ];
};

const renderPage = (
  title: string,
  frontmatter: string,
  sections: PageSection[],
): string =>
  `---\n${frontmatter}---\n\n# ${title}\n\n${
    sections
      .map((s) => `## ${s.heading}\n\n${s.body}`)
      .join("\n\n")
  }`;

/** Build category index page markdown. */
export const renderCategoryPage = (
  category: string,
  entries: BookmarkEntry[],
  updatedAt: string,
): string => {
  const sections = [
    ...buildBookmarkSections(entries, "category"),
    {
      heading: "Related Domains",
      body: [...new Set(entries.map((e) => e.primary_domain))]
        .map((d) => `- [[domains/${d}]]`)
        .join("\n"),
    },
    {
      heading: "Top Authors",
      body: [...new Set(entries.map((e) => e.author_handle))]
        .slice(0, 20)
        .map((h) => `- [[entities/${h}]]`)
        .join("\n"),
    },
  ];

  return renderPage(
    category,
    `type: index\ncategory: ${category}\ncount: ${entries.length}\nupdated: ${updatedAt}\n`,
    [
      {
        heading: "",
        body: `${entries.length} bookmarks in this category.`,
      },
      ...sections,
    ],
  );
};

/** Build domain index page markdown. */
export const renderDomainPage = (
  domain: string,
  entries: BookmarkEntry[],
  updatedAt: string,
): string => {
  const sections = [
    ...buildBookmarkSections(entries, "domain"),
    {
      heading: "Related Categories",
      body: [...new Set(entries.map((e) => e.primary_type))]
        .map((c) => `- [[categories/${c}]]`)
        .join("\n"),
    },
    {
      heading: "Top Authors",
      body: [...new Set(entries.map((e) => e.author_handle))]
        .slice(0, 20)
        .map((h) => `- [[entities/${h}]]`)
        .join("\n"),
    },
  ];

  return renderPage(
    domain,
    `type: index\ndomain: ${domain}\ncount: ${entries.length}\nupdated: ${updatedAt}\n`,
    [
      { heading: "", body: `${entries.length} bookmarks in this domain.` },
      ...sections,
    ],
  );
};

/** Build entity page markdown. Caller filters by ENTITY_THRESHOLD. */
export const renderEntityPage = (
  handle: string,
  entries: BookmarkEntry[],
  updatedAt: string,
): string => {
  const authorName = entries[0]?.author_name || handle;
  const categories = [...new Set(entries.map((e) => e.primary_type))];
  const domains = [...new Set(entries.map((e) => e.primary_domain))];

  const sections = [
    ...buildBookmarkSections(entries, "domain"),
    {
      heading: "Categories",
      body: categories.map((c) => `- [[categories/${c}]]`).join("\n"),
    },
    {
      heading: "Domains",
      body: domains.map((d) => `- [[domains/${d}]]`).join("\n"),
    },
  ];

  return renderPage(
    `@${handle} — ${authorName}`,
    `type: entity\nauthor: @${handle}\nauthor_name: "${authorName}"\ncount: ${entries.length}\nupdated: ${updatedAt}\n`,
    [
      {
        heading: "",
        body: `${entries.length} bookmarks from this author.`,
      },
      ...sections,
    ],
  );
};

/** Build master wiki index markdown. */
export const renderMasterIndex = (
  totalBookmarks: number,
  byCategory: Record<string, BookmarkEntry[]>,
  byDomain: Record<string, BookmarkEntry[]>,
  byAuthor: Record<string, BookmarkEntry[]>,
  updatedAt: string,
): string => {
  const entities = topEntities(byAuthor, 50);

  return `---\ntype: index\nupdated: ${updatedAt}\n---\n\n# Bookmark Index\n\nTotal: ${totalBookmarks} bookmarks\n\n## By Category\n\n${
    TYPES.map(
      (t: string) => `- [[categories/${t}|${t}]] (${byCategory[t]?.length || 0})`,
    ).join("\n")
  }
\n## By Domain\n\n${
    DOMAINS.map(
      (d: string) => `- [[domains/${d}|${d}]] (${byDomain[d]?.length || 0})`,
    ).join("\n")
  }
\n## Top Entities\n\n${
    entities
      .map(
        ([handle, entries]) => `- [[entities/${handle}|@${handle}]] (${entries.length})`,
      )
      .join("\n")
  }
  }`;
};

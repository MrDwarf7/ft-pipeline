# B5 — Indexes reads wrong columns, missing entity pages
**Priority:** P2 — Important
**Status:** Generates broken index pages referencing ft's old data

## Problem

indexes.ts reads from `primary_category` and `primary_domain` (ft's old columns)
instead of `our_primary_type` and `our_primary_domain` (our classification).
After B2 fixes classify to write `our_*` columns, the indexes will be reading
stale/empty data.

Also missing from the agreed plan:
1. **Entity pages** — per-author pages for authors with 5+ bookmarks
2. **Cross-links** — `[[domains/agentic]]`, `[[categories/technique]]`, `[[entities/handle]]`
3. **Enriched content summaries** — index entries should use clippings_text, not just tweet text

## Steps

### 1. Update column references in query

Change the query to read from `our_*` columns:

```typescript
// BEFORE:
const bookmarks = db.prepare(`
  SELECT tweet_id, text, author_handle, author_name, posted_at,
         primary_category, primary_domain,
         COALESCE(like_count, 0) as likes
  FROM bookmarks
  WHERE primary_category IS NOT NULL AND primary_category != 'unclassified'
  ORDER BY posted_at DESC
`).all<BookmarkEntry>();

// AFTER:
const bookmarks = db.prepare(`
  SELECT tweet_id, text, author_handle, author_name, posted_at,
         our_primary_type, our_primary_domain,
         COALESCE(like_count, 0) as likes,
         COALESCE(clippings_text, text) as display_text
  FROM bookmarks
  WHERE our_primary_type IS NOT NULL
  ORDER BY posted_at DESC
`).all<BookmarkEntry>();
```

### 2. Update BookmarkEntry interface

```typescript
interface BookmarkEntry {
  tweet_id: string;
  text: string;
  display_text: string;        // ← enriched text (clippings or original)
  author_handle: string;
  author_name: string;
  posted_at: string;
  our_primary_type: string;    // ← was primary_category
  our_primary_domain: string;  // ← was primary_domain
  likes: number;
}
```

### 3. Update grouping logic

Replace `primary_category` and `primary_domain` refs in reduce callbacks:

```typescript
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
```

### 4. Add cross-links to index pages

Update formatBookmarkLine to include wiki-style cross-links:

```typescript
const formatBookmarkLine = (b: BookmarkEntry, linkType: LinkType): string => {
  const date = b.posted_at ? new Date(b.posted_at).toISOString().split("T")[0] : "unknown";
  const linkTarget = linkType === "category" ? b.our_primary_type : b.our_primary_domain;
  // Use display_text (clippings enriched) for preview, cap at 120 chars
  const textPreview = b.display_text.length > 120
    ? b.display_text.slice(0, 120) + "..."
    : b.display_text;
  const escapedText = textPreview.replace(/\n/g, " ");

  return `- **@${b.author_handle}** (${date}) -- ${escapedText}
  [[${linkType}s/${linkTarget}]] | [[entities/${b.author_handle}]] | [Original](https://x.com/i/status/${b.tweet_id})${
    b.likes > 100 ? ` | ❤️ ${b.likes}` : ""
  }`;
};
```

### 5. Add entity page generation

After category and domain pages, generate per-author entity pages:

```typescript
// Generate entity pages (authors with 5+ bookmarks)
const entityDir = `${CONFIG.mdOutputDir}/entities`;
await Deno.mkdir(entityDir, { recursive: true });

// Group by author
const byAuthor = bookmarks.reduce(
  (acc, b) => {
    return { ...acc, [b.author_handle]: [...(acc[b.author_handle] || []), b] };
  },
  {} as Record<string, BookmarkEntry[]>,
);

// Only generate pages for authors with 5+ bookmarks
const ENTITY_THRESHOLD = 5;

const writeEntityPage = async ([handle, entries]: [string, BookmarkEntry[]]) => {
  if (entries.length < ENTITY_THRESHOLD) return;

  const topByLikes = entries.toSorted((a, b) => b.likes - a.likes).slice(0, 50);
  const authorName = entries[0]?.author_name || handle;

  // Get unique categories and domains for this author
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
```

### 6. Update master index to include entities

Add entity links to the master index.md:

```typescript
// After the domain section, add:
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
```

### 7. Verify

```bash
deno task indexes
ls ~/.ft-bookmarks/md/entities/ | head -10     # Should have author pages
ls ~/.ft-bookmarks/md/categories/               # Should have category pages
ls ~/.ft-bookmarks/md/domains/                  # Should have domain pages
cat ~/.ft-bookmarks/md/index.md | head -20      # Should show our_* categories

# Check cross-links exist
grep -r "\[\[entities/" ~/.ft-bookmarks/md/categories/ | head -5
grep -r "\[\[domains/" ~/.ft-bookmarks/md/entities/ | head -5
```

## Acceptance Criteria

- [ ] Reads from `our_primary_type` / `our_primary_domain` columns
- [ ] Uses `clippings_text` for entry previews when available
- [ ] Category pages have cross-links to domains and entities
- [ ] Domain pages have cross-links to categories and entities
- [ ] Entity pages generated for authors with 5+ bookmarks
- [ ] Master index includes entity links
- [ ] All pages use Obsidian wiki-link syntax (`[[...]]`)

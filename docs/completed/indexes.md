# INDEXES Step — Complete

**Date completed:** 2026-05-05 **Status:** ✅ Fully implemented

## What Was Done

The INDEXES step generates Obsidian-wiki-compatible index pages from classified bookmarks. Creates
category pages, domain pages, entity (author) pages, and a master index.

## Implementation

**File:** `commands/indexes.ts`

## Generated Pages

All output goes to `CONFIG.mdOutputDir` (`~/.ft-bookmarks/md/`):

### Category Pages

`md/categories/{type}.md` — bookmarks grouped by primary_type

- Bookmark listings (top by engagement, recent)
- Related domains cross-links
- Top authors with entity links

### Domain Pages

`md/domains/{domain}.md` — bookmarks grouped by primary_domain

- Bookmark listings (top by engagement, recent)
- Related categories cross-links
- Top authors with entity links

### Entity Pages

`md/entities/{handle}.md` — author pages (5+ bookmarks, configurable via `ENTITY_THRESHOLD`)

- Author name, bookmark count
- Bookmark listings (top by engagement, recent)
- Categories and domains cross-links

### Master Index

`md/index.md` — overview with counts

- Total bookmark count
- Links to all categories with counts
- Links to all domains with counts
- Top entities (by bookmark count, capped at 50)

## Cross-Links

All pages use Obsidian wiki-links:

- `[[categories/{type}]]`
- `[[domains/{domain}]]`
- `[[entities/{handle}]]`
- Links to original tweets: `https://x.com/i/status/{tweet_id}`

## API / Usage

```bash
deno task start indexes              # Generate all index pages
deno task full                       # Includes indexes (runs last)
```

## Schema

Reads from pipeline.db `bookmarks` table:

- `primary_type`, `primary_domain` — for grouping
- `clippings_text` — fallback for `display_text` in listings
- `author_handle`, `author_name` — for entity pages

## Notes

- Uses `display_text` with `clippings_text` fallback for richer summaries
- Configurable `ENTITY_THRESHOLD` (default: 5 bookmarks for entity pages)
- All pages include frontmatter (type, category/domain, count, updated timestamp)

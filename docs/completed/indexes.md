# INDEXES Step -- Complete

**Date completed:** 2026-05-05 **Status:** Fully implemented

## What Was Done

The INDEXES step generates Obsidian-wiki-compatible index pages from classified bookmarks. Creates
category pages, domain pages, entity (author) pages, and a master index.

## Implementation

**File:** `src/commands/indexes.ts`

## Generated Pages

All output goes to `CONFIG.mdOutputDir` (`~/StoneVault/wiki/`):

### Category Pages

`wiki/categories/{type}.md` -- bookmarks grouped by primary_type

- Bookmark listings (top by engagement, recent)
- Related domains cross-links
- Top authors with entity links

### Domain Pages

`wiki/domains/{domain}.md` -- bookmarks grouped by primary_domain

- Bookmark listings (top by engagement, recent)
- Related categories cross-links
- Top authors with entity links

### Entity Pages

`wiki/entities/{handle}.md` -- author pages (5+ bookmarks, configurable via `ENTITY_THRESHOLD`)

- Author name, bookmark count
- Bookmark listings (top by engagement, recent)
- Categories and domains cross-links

### Master Index

`wiki/index.md` -- top-level index

- By category (counts per type)
- By domain (counts per domain)
- Top entities (50 most prolific authors)

## Hash-Based Caching

Uses SHA-256 hash comparison before writing (see `src/utils/hash.ts`). Only writes files when
content has changed, reducing I/O on subsequent runs.

## Usage

```bash
deno task indexes              # Generate all index pages
```

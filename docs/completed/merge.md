# MERGE Step — Complete

**Date completed:** 2026-05-05 **Status:** ✅ Fully implemented

## What Was Done

The MERGE step reads enriched text from Clippings (written by EXTRACT) and merges it back into the
pipeline DB (`clippings_text` column). This gives the CLASSIFY step access to full article/post
content instead of just tweet text.

## Implementation

**File:** `commands/merge.ts`

- Reads all `.md` files from `Clippings/{X-Articles, X-Posts, X-Media}/`
- Parses frontmatter to extract `tweet_id`
- Uses `extractBody()` to get the markdown body content
- Priority: articles > posts > media (richest content wins via `TYPE_RANK`)
- Caps `clippings_text` at 5000 chars
- Uses SQLite transactions for bulk updates
- Dry-run mode (`--dry-run`) shows stats without writing
- Logs enrichment status after merge

## API / Usage

```bash
deno task merge              # Run merge
deno task merge --dry-run   # Preview without writing
```

Also called automatically in `deno task full` (between EXTRACT and CLASSIFY).

## Schema

Writes to pipeline.db `bookmarks` table:

- `clippings_text` — enriched content (max 5000 chars)
- `clippings_type` — X-Articles | X-Posts | X-Media
- `clippings_merged_at` — ISO timestamp

## Notes

- Replaces the old Python script (`_archive/merge-clippings.py`)
- Fully integrated: `types.ts` Command enum, `pipeline.ts`, `deno.json` task, `runFull()`
  orchestration

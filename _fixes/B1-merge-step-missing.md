# B1 — Merge step missing from pipeline

**Priority:** P1 — Critical **Status:** Blocks classification quality

## Problem

The agreed pipeline has a MERGE step between EXTRACT and CLASSIFY. It should read the Clippings .md
files, extract enriched text, and write it back to the DB as `clippings_text`. This gives the
classifier 4883 chars of article content instead of 23 chars of "https://t.co/...".

Without merge, classify reads `row.article_text || row.text` — the old `article_text` column only
has 27 rows. The 1769 Clippings files (74 articles + 1153 posts + 542 media) never make it into the
DB.

A Python version (`merge-clippings.py`) exists in `_archive/` but is not integrated into the Deno
pipeline at all.

## Steps

### 1. Create `commands/merge.ts`

New file. Core logic:

```typescript
// commands/merge.ts
import { Database } from "https://deno.land/x/sqlite3@0.12.0/mod.ts";
import { CONFIG } from "../config.ts";

interface MergeOptions {
  dryRun?: boolean;
}

// Parse a clipping .md file: extract frontmatter tweet_id + body text
const parseClipping = (content: string): { tweetId: string; body: string } | null => {
  // Frontmatter between first two --- lines
  const fmMatch = content.match(/^---\n([\s\S]*?)\n---/);
  if (!fmMatch) return null;

  const tweetIdMatch = fmMatch[1].match(/^tweet_id:\s*(\S+)/m);
  if (!tweetIdMatch) return null;

  // Body is everything after the second ---
  const bodyStart = content.indexOf("---", content.indexOf("---") + 3) + 3;
  const body = content.slice(bodyStart).trim();

  return { tweetId: tweetIdMatch[1], body };
};

// Read all clipping files from the three dirs
const readClippings = async (): Promise<Map<string, { body: string; type: string }>> => {
  const clippings = new Map<string, { body: string; type: string }>();

  for (const [type, dir] of Object.entries(CONFIG.clippingDirs)) {
    const dirPath = `${CONFIG.clippingsBase}/${dir}`;
    try {
      for await (const entry of Deno.readDir(dirPath)) {
        if (!entry.isFile || !entry.name.endsWith(".md")) continue;
        const content = await Deno.readTextFile(`${dirPath}/${entry.name}`);
        const parsed = parseClipping(content);
        if (!parsed) continue;

        // Priority: articles > posts > media
        // If we already have this tweet_id, only overwrite if new type is richer
        const existing = clippings.get(parsed.tweetId);
        const typeRank = { articles: 3, posts: 2, media: 1 };
        const newRank = typeRank[type as keyof typeof typeRank] || 0;
        const existingRank = existing ? (typeRank[existing.type as keyof typeof typeRank] || 0) : 0;

        if (!existing || newRank > existingRank) {
          clippings.set(parsed.tweetId, {
            body: parsed.body.slice(0, 5000), // Cap at 5000 chars
            type,
          });
        }
      }
    } catch { /* dir doesn't exist */ }
  }

  return clippings;
};

export const runMerge = async (options: MergeOptions = {}): Promise<void> => {
  const clippings = await readClippings();
  logger.info("read clippings", { count: clippings.size });

  const db = new Database(CONFIG.dbPath);
  db.exec("PRAGMA journal_mode=WAL");
  try {
    // Add columns if they don't exist
    db.exec(`
      ALTER TABLE bookmarks ADD COLUMN clippings_text TEXT;
      ALTER TABLE bookmarks ADD COLUMN clippings_type TEXT;
      ALTER TABLE bookmarks ADD COLUMN clippings_source_file TEXT;
      ALTER TABLE bookmarks ADD COLUMN clippings_merged_at TEXT;
    `);
  } catch { /* columns already exist */ }

  // ... match and update logic ...
};
```

### 2. Add `clippings_text` column to DB

Run ALTER TABLE to add columns. Handle "column already exists" gracefully:

- `clippings_text TEXT` — enriched body text (capped at 5000 chars)
- `clippings_type TEXT` — 'article' | 'post' | 'media' (from Clippings dir)
- `clippings_merged_at TEXT` — ISO timestamp of when merge ran

Check if columns exist first with `PRAGMA table_info(bookmarks)` before ALTER.

### 3. Add merge to Command enum

In `types.ts`:

```typescript
export const Command = {
  // ... existing ...
  Merge: "merge",
} as const;
```

### 4. Add pipeline.merge

In `pipeline.ts`:

```typescript
import { runMerge } from "./commands/merge.ts";

export const pipeline = {
  // ... existing ...
  merge: (args: Args) => () => runMerge({ dryRun: args["dry-run"] }),
};
```

### 5. Insert merge in runFull()

Change `runFull()` pipeline order:

```typescript
const stepList = [
  ["Sync", pipeline.sync(args)],
  ["Extract", pipeline.extract(args)],
  ["Merge", pipeline.merge(args)], // ← NEW
  ["Classify", pipeline.classify(args)],
  ["Generate", pipeline.generate()],
  ["Indexes", pipeline.indexes()],
] as const;
```

### 6. Add merge task to deno.json

```json
{
  "tasks": {
    "merge": "deno run --allow-read --allow-write --allow-env main.ts merge",
    ...
  }
}
```

### 7. Verify

```bash
deno task merge --dry-run     # Should show count of clippings to merge
deno task merge               # Actually merge
sqlite3 ~/.ft-bookmarks/bookmarks.db "SELECT COUNT(*) FROM bookmarks WHERE clippings_text IS NOT NULL"
# Should return ~1769
```

## Acceptance Criteria

- [ ] `deno task merge` reads all Clippings .md files
- [ ] Matches each to a bookmark by tweet_id
- [ ] Writes `clippings_text` (body, capped 5000 chars) + `clippings_type` + timestamp
- [ ] Priority: articles > posts > media (richest content wins)
- [ ] ~1769 bookmarks enriched
- [ ] classify.ts reads `clippings_text` instead of `article_text`

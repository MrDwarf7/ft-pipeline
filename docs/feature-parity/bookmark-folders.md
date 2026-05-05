# Feature: Bookmark Folders

## What We Want (Your Requirements)

- Sync X bookmark folder tags (read-only mirror of X's current folder state)
- Tag bookmarks with folder names
- List/filter bookmarks by folder
- Show folder distribution
- Kill dependency on ft-cli for this — implement natively

## Source (fieldtheory-cli reference only)

- `ft sync --folders`: Sync all folder tags
- `ft sync --folder <name>`: Sync single folder (exact or prefix match)
- `ft list --folder <name>`: Filter by folder
- `ft folders`: Show distribution
- Implementation: `syncBookmarkFolders()` in `graphql-bookmarks.ts`

## Porting Plan

1. **DB Schema** (add to `pipeline.db`):

```sql
CREATE TABLE bookmark_folders (
  folder_id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  bookmark_count INTEGER DEFAULT 0
);

CREATE TABLE bookmark_folder_tags (
  tweet_id TEXT NOT NULL,
  folder_id TEXT NOT NULL,
  PRIMARY KEY (tweet_id, folder_id),
  FOREIGN KEY (tweet_id) REFERENCES bookmarks(tweet_id),
  FOREIGN KEY (folder_id) REFERENCES bookmark_folders(folder_id)
);
```

2. **Sync Integration**: Add to existing `commands/sync.ts`
   - New flags: `--folders`, `--folder <name>` to `types.ts` Command.Sync
   - Folder sync runs after main GraphQL timeline sync (match ft-cli behavior)
   - Reuse existing cookie logic from `cookies.ts`

3. **CLI Commands**:
   - `deno task sync --folders` → sync all folders
   - `deno task sync --folder "Coding"` → sync single folder
   - Add `Command.List` filter by folder (read from DB)
   - Add `Command.Folders` to show distribution

4. **Config**: No new env vars (uses existing `FT_COOKIES_PATH`)

## Conventions

- Deno/TypeScript, `@db/sqlite` for DB
- Folder name resolution: exact match > unambiguous prefix (case-insensitive)
- Sanitize folder names for display (prevent terminal injection)
- Atomic JJ commits: code, docs, tests separate

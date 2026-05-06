# F3 — Bookmark Folders

**Priority: P3 (wanted but not needed for base functionality)**
**Goal: Sync X bookmark folder tags, tag bookmarks, list/filter by folder. Implement natively (no ft-cli dependency).**

## Blake's Explicit Requirements

From `docs/feature-parity/bookmark-folders.md` and conversation:
- Sync X bookmark folder tags (read-only mirror)
- Tag bookmarks with folder names
- List/filter bookmarks by folder
- Show folder distribution
- **Must be clean implementation** (ft-cli code is "messy and full of procedural shit")

## Source Reference (ft-cli)

From `fieldtheory-cli/src/graphql-bookmarks.ts`:
- `BOOKMARK_FOLDERS_QUERY_ID = 'i78YDd0Tza-dV4SYs58kRg'`
- `BOOKMARK_FOLDER_TIMELINE_QUERY_ID = 'LML09uXDwh87F1zd7pbf2w'`
- `syncBookmarkFolders()` function (port this logic)

**Important**: These GraphQL queries live in the same file as the main sync. If we're already porting `graphql-bookmarks.ts` for F0, adding folder support might be easier during that port.

## DB Schema Changes

New tables in `pipeline.db`:

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

Add to `commands/migrate.ts` or create a new migration.

## Implementation

### Option A: Include in F0 (Base GraphQL Port)

If porting during F0:
- Add folder methods to `ConnectedSource` interface:
  ```typescript
  // src/extraction/index.ts
  export interface ConnectedSource {
    fetchBatch(ids?: string[]): Promise<TweetData[]>;
    fetchFolders(): Promise<FolderData[]>;
    fetchFolderTimeline(folderId: string): Promise<TweetData[]>;
    ...
  }
  ```
- Implement in `src/extraction/graphql.ts`
- New DB tables created before use

**Pros**: One less refactor later.
**Cons**: Might bloat F0 if folder logic is complex.

### Option B: Separate Implementation (F3)

After F0 is done:
- Create `src/extraction/graphql-folders.ts` (or add to `graphql.ts`)
- Add folder sync to `commands/sync.ts`:
  ```typescript
  // Inside runSync():
  if (options.folders) {
    const folders = await source.fetchFolders();
    // Store folders, tag bookmarks
  }
  ```
- New CLI flags: `--folders`, `--folder <name>` (add to `types.ts`)

**Pros**: Cleaner separation, F0 stays focused.
**Cons**: Two refactors of `graphql.ts` / `sync.ts`.

## CLI Commands

From `docs/feature-parity/bookmark-folders.md`:

```bash
deno task sync --folders          # Sync all folders
deno task sync --folder "Coding"  # Sync single folder (exact or prefix match)
deno task list --folder "AI"       # Filter by folder
deno task folders                  # Show folder distribution
```

Add to `types.ts`:
- `Command.Sync` flags: `--folders`, `--folder <name>`
- `Command.List` flag: `--folder <name>`
- `Command.Folders` (new command): Show distribution

## Folder Name Resolution

From ft-cli porting plan:
- Exact match first
- Unambiguous prefix match (case-insensitive)
- Sanitize folder names for display (prevent terminal injection)

## Config Changes

No new env vars needed. Folder sync reuses `FT_COOKIES_PATH` for authentication.

## Conventions Checklist

- [ ] Deno/TypeScript, `@db/sqlite` for DB
- [ ] Folder name resolution: exact > prefix (case-insensitive)
- [ ] Sanitize folder names (prevent terminal injection)
- [ ] JJ atomic commits: code, docs, tests separate
- [ ] Run `deno task ch:all` after every edit

## Success Criteria

- [ ] `deno task sync --folders` syncs all folder tags
- [ ] `deno task sync --folder "Coding"` syncs single folder
- [ ] `deno task list --folder "AI"` filters bookmarks
- [ ] `deno task folders` shows distribution
- [ ] DB tables `bookmark_folders` and `bookmark_folder_tags` populated
- [ ] `deno task ch:all` passes

## Decision: F0 or F3?

**Recommendation**: If folder GraphQL queries are simple (< 50 lines added to `graphql.ts`), include in F0. Otherwise, defer to F3 and keep F0 focused on base sync.

Blake's note: *"if it's simply easier to do during the initial port over of the logic — then we can bring it, but we'll want to make sure it's a proper clean impl."*

Clean implementation means:
- Separate function for folder sync (not inline in main sync)
- Proper error handling (folders API might fail independently)
- No procedural spaghetti like ft-cli

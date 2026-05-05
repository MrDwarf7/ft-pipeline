# Feature Parity: Bookmark Folders (ft-cli → ft-pipeline)

> Source:
> `/home/dwarf/Documents/GitHub_Projects/JavaScript/fieldtheory-cli/src/graphql-bookmarks.ts` Date:
> 2026-05-05 Goal: Document ft-cli's folder sync logic for porting to ft-pipeline.

## Overview

ft-cli added bookmark folder support — X lets users organize bookmarks into folders, and ft-cli can:

1. Fetch the list of bookmark folders
2. Walk each folder's timeline (all tweets in that folder)
3. Mirror folder state to local records (tag/untag bookmarks)

**Key principle (from ft-cli)**: READ ONLY — only GET requests to X. Never POST/PUT/DELETE.

---

## Folder Data Structures (from ft-cli `types.ts`)

```typescript
// Bookmark folder
interface BookmarkFolder {
  id: string; // X's internal folder ID
  name: string; // User-visible folder name
}

// In bookmark record (ft-cli uses parallel arrays)
interface BookmarkRecord {
  // ...
  folderIds?: string[]; // Array of folder IDs this bookmark belongs to
  folderNames?: string[]; // Parallel array of folder names (for display)
}
```

---

## API Endpoints (ft-cli → X)

### 1. Fetch folder list

- **Query ID**: `BOOKMARK_FOLDERS_QUERY_ID = "i78YDd0Tza-dV4SYs58kRg"`
- **Operation**: `BookmarkFoldersSlice`
- **URL**: `https://x.com/i/api/graphql/{QUERY_ID}/{OPERATION}?variables={}&features={}`
- **Response paths** (X uses multiple):
  - `data.viewer.user_results.result.bookmark_collections_slice.items`
  - `data.viewer.bookmark_collections_slice.items`
  - `data.bookmark_collections_slice.items`

### 2. Fetch folder timeline (tweets in a folder)

- **Query ID**: `BOOKMARK_FOLDER_TIMELINE_QUERY_ID = "LML09uXDwh87F1zd7pbf2w"`
- **Operation**: `BookmarkFolderTimeline`
- **Variables**: `{ bookmark_collection_id: folderId, count: pageSize, cursor?: string }`
- **Response**: Same structure as main bookmarks timeline

---

## Core Functions (ft-cli)

### `fetchBookmarkFolders(csrfToken, cookieHeader)`

- Fetches list of all bookmark folders
- Returns `BookmarkFolder[]` with `id` and `name`
- Handles 401/403 (session expired) with helpful error message

### `walkFolderTimeline(csrfToken, folderId, options)`

- Paginates through all tweets in a folder
- Returns `FolderWalkResult`:
  - `complete: boolean` — true only if we hit natural end (no more pages)
  - `records: BookmarkRecord[]` — all tweets in folder
- **Soft cap**: `MAX_RECORDS_PER_FOLDER = 50_000` — aborts if exceeded (returns `complete: false`)
- Rate limit handling: 429 → exponential backoff, 5xx → retry with delay

### `applyFolderMirror(existing, folder, walkedRecords)`

- **Mirrors X's CURRENT folder state to local records**
- Semantics:
  - Records IN the walked set → gain/keep the folder tag
  - Records NOT in walked set → folder tag REMOVED (if present)
  - Other folder tags on same records are untouched
  - Records we've never seen → added with folder tag
- **Only call with `complete === true`** — incomplete walks skip state modification
- Returns `FolderMirrorStats`:
  - `added`: new records added
  - `tagged`: existing records that gained this folder tag
  - `untagged`: existing records that lost this folder tag
  - `unchanged`: records that already had the tag

### Helper functions

- `withFolder(record, folder)` — adds folder to record (defensive against duplicates)
- `withoutFolder(record, folderId)` — removes folder from record

---

## Porting Strategy for ft-pipeline

### DB Schema Options

**Option A: Add columns to `bookmarks` table** (ft-cli approach)

```sql
ALTER TABLE bookmarks ADD COLUMN folder_ids TEXT;     -- JSON array
ALTER TABLE bookmarks ADD COLUMN folder_names TEXT;   -- JSON array
```

- ✅ Simple, no joins needed
- ❌ Parallel arrays are messy
- ❌ More columns in an already-wide table

**Option B: Separate tables** (cleaner, user's preference for avoiding column bloat)

```sql
CREATE TABLE bookmark_folders (
  folder_id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  updated_at TEXT
);

CREATE TABLE bookmark_folder_memberships (
  tweet_id TEXT NOT NULL,
  folder_id TEXT NOT NULL,
  FOREIGN KEY (tweet_id) REFERENCES bookmarks(tweet_id),
  FOREIGN KEY (folder_id) REFERENCES bookmark_folders(folder_id),
  PRIMARY KEY (tweet_id, folder_id)
);
```

- ✅ Normalized, no column bloat
- ✅ Easy to query "all bookmarks in folder X"
- ✅ Easy to query "all folders for bookmark X"
- ❌ Requires JOINs

**Recommendation**: **Option B** — separate tables. Aligns with your concern about too many columns.
JOINs are cheap for this data size.

---

### Sync Flow (where to plug in folder sync)

**Current flow** (our planned in-house sync):

```
1. GraphQL: fetch bookmark pages (cursor-based)
2. For each page: insert/update into `bookmarks` table
3. Continue until stop condition (maxPages, targetAdds, etc.)
```

**With folder sync**:

```
1. GraphQL: fetch bookmark pages → insert/update `bookmarks`
2. GraphQL: fetch folder list → upsert into `bookmark_folders`
3. For each folder:
   a. Walk folder timeline → get all tweet IDs
   b. Upsert into `bookmark_folder_memberships`
   c. Delete stale memberships (tweets removed from folder on X)
4. Done
```

**When to run folder sync**:

- **Default**: OFF (folders are optional, many users don't use them)
- **Flag**: `--folders` to enable folder sync
- **After main sync**: Folder sync depends on having bookmark data already in DB

---

### Generate Implication (folder → markdown output)

Per your note:

> "if we want to add 'markdown files can now be output to a folder named the same as your X folder'
> then it's super easy"

With the DB schema above:

```typescript
// Get all folders
const folders = db.prepare("SELECT * FROM bookmark_folders").all();

for (const folder of folders) {
  // Get all bookmarks in this folder
  const bookmarks = db.prepare(`
    SELECT b.* FROM bookmarks b
    JOIN bookmark_folder_memberships m ON b.tweet_id = m.tweet_id
    WHERE m.folder_id = ?
  `).all(folder.folder_id);

  // Write to folder-named output dir
  const outDir = `${config.mdOutputDir}/${folder.name}`;
  // ... generate markdown files ...
}
```

---

## ft-cli CLI Flags (for reference)

```
--folders              Enable folder sync
--folder <name>        Sync only a specific folder
```

---

## What ft-pipeline Needs to Implement

### P0 (core folder support):

1. **DB migration**: Create `bookmark_folders` and `bookmark_folder_memberships` tables
2. **`fetchBookmarkFolders()`**: Port from ft-cli (GraphQL call + parsing)
3. **`walkFolderTimeline()`**: Port from ft-cli (pagination + record extraction)
4. **`syncFolderMemberships()`**: Upsert memberships, remove stale entries

### P1 (CLI integration):

5. Add `--folders` flag to sync command
6. Run folder sync after main bookmark sync (when flag is set)

### P2 (generate integration):

7. Add folder-aware output option to generate command
8. Group markdown output by folder name

---

## Not Implementing (ft-cli specific)

- `--folder <name>` (sync specific folder only) — over-engineering for now
- Complex mirror semantics (ft-cli's `applyFolderMirror`) — we can do simpler upsert+delete

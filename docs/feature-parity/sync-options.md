# Feature Parity: Sync Options (ft-cli → ft-pipeline)

> Source:
> `/home/dwarf/Documents/GitHub_Projects/JavaScript/fieldtheory-cli/src/graphql-bookmarks.ts` Date:
> 2026-05-05 Goal: Document what ft-cli's sync options do, what ft-pipeline already has, and what
> needs implementing.

## Option Reference

### 1. `maxPages` — Hard cap on pages fetched

- **ft-cli behavior**: Stops after N pages (1 page = `pageSize` bookmarks, default 20). Default:
  `Infinity`.
- **ft-pipeline status**: ✅ CLI arg `--max-pages` exists in `types.ts`, but **NOT implemented** —
  just passed to ft-cli.
- **Implementation needed**: Add page counter to sync loop, break when `page >= maxPages`.
- **Verdict**: **KEEP** — useful for bounding large bookmark collections.

---

### 2. `targetAdds` — Stop after N new bookmarks

- **ft-cli behavior**: Stops once `totalAdded >= targetAdds`. Lets user say "just get me 50 new
  bookmarks then stop."
- **ft-pipeline status**: ✅ CLI arg `--target-adds` exists in `types.ts`, but **NOT implemented**.
- **Implementation needed**: Track `totalAdded` in sync loop, break when threshold reached.
- **Verdict**: **KEEP** — clean way to do small incremental syncs.

---

### 3. `maxMinutes` — Max runtime in minutes

- **ft-cli behavior**: Checks `Date.now() - started > maxMinutes * 60_000` each loop. Default: 30.
  Stop reason: `'max runtime reached'`.
- **ft-pipeline status**: ✅ CLI arg `--max-minutes` exists in `types.ts`, but **NOT implemented**.
- **Implementation needed**: Add timestamp check at top of sync loop.
- **Verdict**: **KEEP** — prevents runaway syncs, respects rate limits.

---

### 4. `stalePageLimit` — Stop after N consecutive stale pages

- **ft-cli behavior**: Counts consecutive pages where `added === 0`. Resets when new bookmarks
  found. Default: 3. Stop reason: `'no new bookmarks (stale)'`.
- **ft-pipeline status**: ❌ **NOT in CLI args, NOT implemented**.
- **Implementation needed**:
  - Add `--stale-pages` CLI arg (optional, default 3).
  - Track `stalePages` counter in sync loop.
  - Increment when `added === 0`, reset to 0 when `added > 0`.
  - Break when `stalePages >= stalePageLimit`.
- **Verdict**: **KEEP** — prevents infinite loops on exhausted/paused bookmarks.

---

### 5. `staleWhenNoNewRecords` — Stale detection mode

- **ft-cli behavior**: When true, counts pages as stale based on "no new LOCAL records" (not just
  remote). Relevant for incremental sync where remote sends bookmarks we already have cached.
- **ft-pipeline status**: ❌ **NOT in CLI args, NOT implemented**.
- **Implementation needed**: Determine if we want this granularity. It's a subtlety — defaults to
  `false` in ft-cli unless `incremental` is true.
- **Verdict**: **SKIP for now** — `stalePageLimit` with simple "added === 0" check covers 95% of use
  cases. Add later if needed.

---

### 6. `pageSize` — Bookmarks per page

- **ft-cli behavior**: Records per GraphQL page. Range 1–100, default 20. Passed as `count` in
  GraphQL variables.
- **ft-pipeline status**: ❌ **NOT in CLI args, NOT implemented**.
- **Implementation needed**: Add `--page-size` CLI arg (optional). Pass to GraphQL URL builder.
- **Verdict**: **KEEP** — lets users tweak request size. X might rate-limit large pages though, so
  default 20 is fine.

---

### 7. `delayMs` — Delay between page requests

- **ft-cli behavior**: `setTimeout(r, delayMs)` between pages. Default 600ms. Respectful to X's
  servers.
- **ft-pipeline status**: ✅ **Already has `syncDelayMs: 600` in `config.ts`**. Not exposed as CLI
  arg.
- **Implementation needed**: Wire up `config.syncDelayMs` to sync loop. Optionally add `--delay-ms`
  CLI arg.
- **Verdict**: **KEEP** — already implemented in config, just needs wiring.

---

### 8. `incremental` — Stop at already-stored bookmarks

- **ft-cli behavior**: Default `true`. Compares fetched bookmarks against `newestKnownId` (first
  record in existing cache). Stops when `result.records.some(r => r.id === newestKnownId)`. Stop
  reason: `'caught up to newest stored bookmark'`.
- **ft-pipeline status**: ❌ **NOT in CLI args, NOT implemented** (but implied by current behavior —
  we always do incremental via ft-cli).
- **Implementation needed**:
  - Track `newestKnownId` from existing DB records (highest `posted_at` or first `tweet_id`).
  - Break sync loop when reached.
- **Verdict**: **KEEP as default** — incremental is the normal use case. Add `--no-incremental` /
  `--full` flag if we want to support full re-sync.

---

### 9. `resumeCursor` / `--continue` — Resume from saved state

- **ft-cli behavior**:
  - Saves `cursor` to `statePath` (bookmarks-state.json) when sync stops before reaching end.
  - `--continue` loads saved cursor and passes as `resumeCursor`.
  - Skips incremental check when resuming (`!options.resumeCursor` guard).
- **ft-pipeline status**: ✅ `--continue` CLI arg exists, but **NOT implemented**.
- **Implementation needed**:
  - Save `nextCursor` to a state file (e.g., `~/.ft-bookmarks/pipeline-state.json`) after each page.
  - On `--continue`, load cursor from state file and start from there.
  - Skip incremental check when resuming.
- **Verdict**: **KEEP** — essential for recovering from interrupted syncs.

---

### 10. `checkpointEvery` — Flush to DB every N pages

- **ft-cli behavior**: Writes cache to disk every N pages. Default 25. Uses
  `writeJsonLines(cachePath, existing)`.
- **ft-pipeline status**: ❌ **NOT implemented** — we write directly to DB, so this is less
  relevant.
- **Implementation needed**: For our DB-based approach, we're already writing/updating records as we
  go (or in batches). Consider batch commits every N pages for performance.
- **Verdict**: **SKIP** — our DB writes are atomic per record/batch. No need for separate checkpoint
  logic.

---

### 11. Auto-continue (10k cap detection)

- **ft-cli behavior**: Detects if user is stuck at old 10k bookmark cap. Conditions:
  - `incremental && !resumeCursor && existing.length >= 9,500`
  - Not a terminal stop reason, not rate limited, cursor exists
  - Automatically continues paginating with stale-page/caught-up checks disabled
- **ft-pipeline status**: ❌ **NOT implemented**.
- **Implementation needed**: Probably not needed for us — if we control the sync fully, we just keep
  paginating until `nextCursor` is null.
- **Verdict**: **SKIP** — our implementation will naturally handle large collections by paginating
  until exhausted.

---

### 12. `rebuild` — Full re-crawl

- **ft-cli behavior**: Replaces old `--full`. Sets `incremental = false`, refreshes all caches
  without stopping early. Can be paused and resumed with `--continue`.
- **ft-pipeline status**: ✅ `--rebuild` CLI arg exists in `types.ts`, but **NOT implemented**.
- **Implementation needed**:
  - When `--rebuild`, set `incremental = false`.
  - Fetch ALL bookmarks from API (no stop on existing).
  - Still respect `maxPages`, `maxMinutes`, `targetAdds`.
- **Verdict**: **KEEP** — useful for regenerating the entire local DB from scratch.

---

### 13. `gaps` — Backfill missing data

- **ft-cli behavior**: Backfills missing data for existing bookmarks:
  - Quoted tweets (missing `quotedTweet` data)
  - Truncated note_tweets / X Articles (text cutoff at 280 chars)
  - Linked article content (via fetchArticle)
  - Media metadata gaps
  - Uses `TweetResultByRestId` GraphQL API to re-fetch individual tweets by ID
  - Idempotent: second runs print "No gaps found" instead of re-fetching
- **ft-pipeline status**: ✅ `--gaps` CLI arg exists, but **NOT implemented**.
- **Implementation needed**:
  - Scan DB for bookmarks with missing/truncated data.
  - Re-fetch those tweet IDs via `TweetResultByRestId` API.
  - Update DB with fresh data.
  - Mark completion state to avoid re-fetching.
- **Verdict**: **KEEP** — valuable for fixing truncated bookmarks and missing quoted tweets.

---

## Summary: What We Need to Implement

### Core sync loop (P0 — needed for basic sync):

1. ✅ `maxPages` — page counter + break
2. ✅ `targetAdds` — added counter + break
3. ✅ `maxMinutes` — timestamp check + break
4. ✅ `incremental` — stop at existing bookmarks (default true)
5. ✅ `delayMs` — already in config, wire to loop
6. ✅ GraphQL pagination with `nextCursor`

### State management (P1 — recovery + robustness):

7. ✅ `resumeCursor` / `--continue` — save/load cursor state
8. ✅ `rebuild` — full re-crawl mode

### Enhanced features (P2 — nice to have):

9. ✅ `stalePageLimit` — stale page detection
10. ✅ `pageSize` — configurable records per page
11. ✅ `gaps` — backfill missing data

### Skip (not needed for our use case):

- ❌ `staleWhenNoNewRecords` — over-engineering
- ❌ `checkpointEvery` — DB writes are atomic
- ❌ Auto-continue (10k cap) — we'll handle large collections naturally

---

## ft-pipeline Current CLI Args (from `types.ts`)

```typescript
export interface Args {
  // ...
  "max-pages"?: string;
  "target-adds"?: string;
  "max-minutes"?: string;
  rebuild?: boolean;
  continue?: boolean;
  gaps?: boolean;
}
```

**Missing CLI args to add**:

- `--stale-pages` (optional, maps to `stalePageLimit`)
- `--page-size` (optional, maps to `pageSize`)
- `--delay-ms` (optional, override `config.syncDelayMs`)
- `--no-incremental` / `--full` (optional, maps to `incremental = false`)

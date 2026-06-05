# TODO — Pipeline Open Issues

Agreed pipeline order: **SYNC → EXTRACT → MERGE → CLASSIFY → GENERATE → INDEXES**

---

## ✅ Migration Complete (2026-06-05)

The pipeline is now fully independent of the old fieldtheory-cli tool.

**What changed:**

- **DB ownership** — `pipeline.db` at `/home/dwarf/.config/ft-pipeline/pipeline.db`
- **Generate step** — shell-out to `ft-cli` removed, replaced with pure-Deno implementation
- **Cookies** — `.sync-cookies.enc` moved to `/home/dwarf/.config/ft-pipeline/`
- **Output dir** — rsynced from `.ft-bookmarks/md/` to `.config/ft-pipeline/output/`
- **Log dir** — logs now go to `.config/ft-pipeline/logs/`
- **Classification results** — now at `.config/ft-pipeline/classification-results.json`
- **Config** — all `.ft-bookmarks` references stripped
- **Logging** — daily rotation changed to **time-based** (`YYYY-MM-DD_HH-MM-SS.log`)
- **Indexing** — now uses **SHA-256 hash comparison** before writing (saves disk I/O)

---

## ✅ Logging Fix (2026-06-05)

**Problem:** Log files were named only by date (`pipeline-YYYY-MM-DD.log`), causing overwrites when
multiple pipeline runs occurred within the same day.

**Solution:**

- Changed filename format to `pipeline-YYYY-MM-DD_HH-MM-SS.log`
- Added `logTime` state variable alongside `logDate`
- Updated file stream check to compare both date AND time
- Added `logTime` to the `getLogFile()` function signature

**Files modified:**

- `src/utils/logger.ts` — updated `getLogFile()` and added `logTime` state

**Tested:** Full pipeline run confirms unique log files per run.

---

## ✅ Indexing Hash Caching (2026-06-05)

**Problem:** Index files were rewritten on every run, even when content hadn't changed, wasting disk
I/O and causing unnecessary writes.

**Solution:**

- Created new utility `src/utils/hash.ts` with SHA-256 hashing functions:
  - `hashFile()` — reads file in chunks and computes hash (memory efficient)
  - `hashContent()` / `hashContentSync()` — hashes string content
  - `hashesMatch()` — compare two hash strings
  - `needsUpdate()` — check if existing file needs updating
- Modified `src/commands/indexes.ts` to:
  - Compare content hashes before writing
  - Only write file if hash differs (or file doesn't exist)
  - Log "updated" vs "unchanged" for each page type
  - Use base directory (`categories/`, `domains/`, `entities/`) for hash comparison

**Files created/modified:**

- `src/utils/hash.ts` (new file)
- `src/commands/indexes.ts` (updated with hash comparison)

**Performance:** Expected ~5-10x I/O reduction on subsequent runs when data is static.

---

## ⚠️ "null" Entity Page Issue (2026-06-05)

**Problem:** Some entity pages are being created with `handle: "null"` (literally the string
`"null"` instead of a valid handle), causing malformed paths like `entities/null.md`.

**Root cause:** DB records where `author_handle` is `NULL` or empty, and we're converting it to the
string `"null"` somewhere in the pipeline.

**Solution (2026-06-05):**

- Added null-safety check in `queryBookmarks()` in `src/commands/indexes.ts`:

  ```sql
  WHERE primary_type IS NOT NULL
    AND (author_handle IS NOT NULL AND author_handle != '')
  ```

- This filters out records where `author_handle` is `NULL` or empty string

**Impact:**

- File path: `.config/ft-pipeline/output/entities/null.md`
- May cause link breaks in Obsidian
- Could cascade into other pages referencing these entities

**Priority:** Medium — affects data quality, not core pipeline flow. **Status:** ✅ Fixed

---

## Step 1: Folder Sync / Gaps Mode ❌ Not Implemented

- **Folder sync** — sync bookmark folders/structure from X (design doc at
  `docs/feature-parity/bookmark-folders.md`)
- **Gaps mode** — backfill missing bookmarks using `--continue` cursor / `--gaps` flag
- Not needed for daily pipeline run, but needed for full ft-cli feature parity

---

## Step 2: Schema-Change Detection / Hard Crash ❌ Not Implemented

**Problem:** When X changes their GraphQL response structure, the Zod schemas in
`src/extraction/graphql.ts` silently produce empty/malformed data instead of alerting us. We can't
design a "flexible enough" schema because we don't know what X will change _to_.

**Proposed approach:**

- Add a **post-parse validation** step that checks basic invariants after Zod parsing (e.g.
  `bookmarks.length > 0`, `text !== ""` on a known bookmark)
- If invariants fail, **hard-crash** with a clear message:

  ```
  X API response structure changed — Zod schema in graphql.ts likely outdated.
  Check raw response vs Zod schema and update.
  ```

- Log the raw response JSON to a debug file before crashing so we can inspect it
- Ideally make this a generic pattern that works across all external API calls (xtracticle too)

---

## Step 3: EXTRACT — Article Images (P2)

- [ ] Article images from xtracticle (`article.cover_media`, `article.media_entities`) not saved to
      clippings (only `tweet.media.all` is processed)
- [ ] xtracticle API responses can be truncated — should save raw JSON first
- [ ] Smarter 429 retry with exponential backoff

---

## Step 4: LLM Health Check — Not Robust Enough

**Problem:** `check()` in `src/llm/openai-compat.ts` only pings `/models` — it verifies the server
is running and a model is loaded, but doesn't validate that the model can _actually produce
inference_. This means the classify loop can start, get N items in, then hit a silent failure.

**To fix:**

- After the `/models` check passes, run a **tiny inference test** (e.g. "Say hello") with a short
  timeout
- If inference fails (empty response, gibberish, timeout), throw before entering the classify loop

---

## Step 5: Index Pages — Multi-Type / Multi-Domain Display

**Problem:** Index pages (`categories/`, `domains/`) only show `primary_type` and `primary_domain` —
the full `types`/`domains` JSON arrays from the DB are ignored.

**To fix:**

- Include secondary types/domains in index listings
- Maybe split "purely this" vs "also this" sections

---

## Summary Table

|     | Step         | Status            | Remaining Work                                     |
| --- | ------------ | ----------------- | -------------------------------------------------- |
|     | Sync         | ✅                | Works — needs schema-change detection added        |
|     | Extract      | ✅ (mostly)       | Article images not captured (P2), schema detection |
|     | Merge        | ✅                | Works                                              |
|     | Classify     | ✅                | Works — needs better LLM health check              |
|     | Generate     | ✅                | Works (Implemented 2026-06-05)                     |
|     | Indexes      | ✅ (hash caching) | Works — needs multi-type/domain display            |
|     | Logging      | ✅ (time-based)   | Works — was daily rotation                         |
|     | "null" issue | ✅ Fixed          | Null-safety added in entity page generation        |
|     | Folder sync  | ❌                | Design doc exists, no code                         |
|     | Gaps mode    | ❌                | Backfill missing bookmarks                         |

## Priority Order

1. **Schema-change detection** — hard-crash on X API format changes
2. **LLM health check** — actual inference test before classify
3. **Folder sync / gaps mode** — feature parity with old ft-cli
4. **Multi-type/domain index display** — P2
5. **Extract article images** — P2
6. **"null" entity page issue** — ✅ Fixed (2026-06-05)

---

## Appendix A: Hard-Coded Values Audit

Compiled 2026-06-05. These are places where fixed values, URLs, or thresholds are baked into the
code that _could_ be configurable via env vars / flags. Not all need to be extracted — some are just
fine as consts. The ones flagged 🔴 are most likely to need changing or break on API changes.

### `src/extraction/graphql.ts` — X GraphQL Client

|| Line(s) | Value | Concern | Priority | |---------|-------|---------|----------| | ~12 |
`BOOKMARKS_QUERY_ID = "Z9GWmP0kP2dajyckAaDUBw"` | X changes query IDs periodically | 🔴 High | | ~11
| `BOOKMARKS_OPERATION = "Bookmarks"` | Operation name, less volatile | 🟡 Medium | | ~13-14 |
`X_PUBLIC_BEARER = "AAAAAAAAAAA...CpTnA"` | Public bearer token, changes periodically | 🔴 High | |
~17-34 | `GRAPHQL_FEATURES = {...}` (15 feature flags) | X changes feature flags format | 🔴 High |
| ~210 | `500 + Math.random() * 1000` jitter | Timing between page fetches | 🟢 Low | | ~229 |
`attempt >= 4` max retries | Retry limit | 🟢 Low | | ~230 | `15 * Math.pow(2, attempt)` capped at
120s | Backoff formula | 🟢 Low | | ~238 | `stalePages >= 2` | Stop after 2 empty pages | 🟡 Medium
| | ~373 | `count = 200` | Page size | 🟢 Low |

### `src/commands/sync.ts`

|| Line(s) | Value | Concern | Priority | |---------|-------|---------|----------| | 114 |
`limit: 1000` | Max bookmarks per sync | 🟢 Low | | ~120 | `concurrency: 3` | API request
concurrency | 🟢 Low |

### `src/utils/bases.ts` — Paths & URLs

|| Line(s) | Value | Concern | Priority | |---------|-------|---------|----------| | 27 |
`/home/dwarf/.config/ft-pipeline` | Config root (abs path) | 🟡 Medium | | 30 |
`/home/dwarf/.config/ft-pipeline/pipeline.db` | DB path | 🟡 Medium | | 33 |
`/home/dwarf/.config/ft-pipeline/.sync-cookies.enc` | Cookies path | 🟡 Medium | | 36 |
`/home/dwarf/.config/ft-pipeline/output` | Output directory | 🟡 Medium | | 39-40 |
`/home/dwarf/.config/ft-pipeline/classification-results.json` | Classification results | 🟢 Low | |
43 | `/home/dwarf/.config/ft-pipeline/logs` | Log directory | 🟢 Low | | 56 |
`/home/dwarf/StoneVault/Clippings` | Vault clippings dir | 🟡 Medium | | 59 |
`https://xtracticle.com/api/thread` | Xtracticle API URL | 🟡 Medium | | 60 |
`http://localhost:1234/v1` | LLM server URL | 🟡 Medium | | 61 |
`Gemma-4-E4B-Uncensored-HauhauCS-Aggressive-Q4_K_M.gguf` | LLM model name | 🟡 Medium |

Note: There's a discrepancy — memory says the model is `Q8_K_P` but bases.ts says `Q4_K_M`. This
used to be Q8_K_P, was changed at some point.

### `src/config.ts` — App Settings

|| Line(s) | Value | Concern | Priority | |---------|-------|---------|----------| | 40 |
`syncDelayMs: 600` | Delay between sync operations | 🟢 Low | | 41 | `extractDelayMs: 750` | Delay
between extracts | 🟢 Low | | 42 | `extractJitterMs: 400` | Jitter range | 🟢 Low | | 45 |
`minPostTextLength: 200` | Min text for short-tweet detection | 🟢 Low | | 46 | `maxRetries: 3` |
Retry count | 🟢 Low | | 47 | `retryBaseMs: 2000` | Retry base interval | 🟢 Low | | 48 |
`classificationBatchSize: 50` | Classify batch size | 🟢 Low | | 51-55 | `clippingDirs` (articles,
posts, media) | Output dir names | 🟢 Low | | 68-95 | `TYPES` / `DOMAINS` arrays | Taxonomy — adding
new ones needs code change | 🟡 Medium |

### `src/llm/openai-compat.ts` — Default LLM Params

|| Line(s) | Value | Concern | Priority | |---------|-------|---------|----------| | 26-31 |
`temperature: 0.3`, `max_tokens: 200` | Default inference params | 🟢 Low | | 33-46 |
`jsonMode: "json_object"` | Default JSON mode | 🟢 Low |

### `src/commands/classify-llm.ts` — Classification LLM Params

|| Line(s) | Value | Concern | Priority | |---------|-------|---------|----------| | 16 |
`CONFIDENCE_THRESHOLD = 0.7` | Low confidence warning | 🟢 Low | | 72 | `content.slice(0, 2000)` |
Content truncation length | 🟢 Low | | 128 | `temperature: 0.1` | Classify-specific temp | 🟢 Low |
| 129 | `maxTokens: 500` | Classify-specific max tokens | 🟢 Low |

### `src/commands/classify.ts` — Classify Runtime

|| Line(s) | Value | Concern | Priority | |---------|-------|---------|----------| | 41 |
`content.trim().length < 10` | Short tweet threshold | 🟢 Low | | 74 | `setTimeout(r, 200)` | Rate
limiter between LLM calls | 🟢 Low |

### `src/commands/extract.ts`

|| Line(s) | Value | Concern | Priority | |---------|-------|---------|----------| | 543 |
`BATCH_SIZE = 10` | Extract batch size | 🟢 Low |

### `src/commands/generate.ts` — Rendering

|| Line(s) | Value | Concern | Priority | |---------|-------|---------|----------| | 37 | `slugify`
maxLen = 60 | Filename slug length | 🟢 Low | | 78 | `firstLine.slice(0, 120)` | Title truncation |
🟢 Low | | 131 | `display_text.slice(0, 80)` | Filename text truncation | 🟢 Low | | 178 |
`BATCH_SIZE = 50` | Write batch size | 🟢 Low |

---

### `src/commands/indexes.ts` — Index Pages (Post-Hash Caching)

|| Line(s) | Value | Concern | Priority | |---------|-------|---------|----------| | 78 |
`topByLikes.slice(0, 50)` | Top by engagement limit | 🟢 Low | | 87 | `slice(0, 20)` | Recent
entries per page | 🟢 Low | | 126 | `slice(0, 20)` | Top authors per page | 🟢 Low | | 197 |
`ENTITY_THRESHOLD = 5` | Min bookmarks for entity page | 🟢 Low | | 254 | `slice(0, 50)` | Top
entities on master index | 🟢 Low |

**Post-hash-caching (2026-06-05):**

- Now uses `needsUpdate()` from `src/utils/hash.ts`
- Compares SHA-256 hashes before writing
- Logs "updated" vs "unchanged" for each page type

---

### `src/utils/hash.ts` — SHA-256 Hashing Utilities

|| Line(s) | Value | Concern | Priority | |---------|-------|---------|----------| | 1-10 |
`CHUNK_SIZE = 65536` | Read chunk size for large files | 🟢 Low | | 14-18 | `hashFile()` | File
hashing (chunked read) | 🟢 Low | | 21-28 | `hashContent()` | Async content hashing | 🟢 Low | |
31-38 | `hashContentSync()` | Sync content hashing | 🟢 Low | | 41-45 | `hashesMatch()` | Hash
comparison | 🟢 Low | | 48-77 | `needsUpdate()` | Check if file needs updating | 🟡 Medium |

**Usage:**

```typescript
const needsUpdate = await needsUpdate(
  existingPath, // Full path to existing file
  baseDir, // Base directory for relative paths
  newContent, // New content to write
);
if (needsUpdate) {
  await Deno.writeTextFile(existingPath, newContent);
}
```

---

### ⚠️ "null" Entity Page Issue (Hard-Coded Values Audit)

|| Line(s) | Value | Concern | Priority | |---------|-------|---------|----------| | 290 |
`author_handle` from DB (can be NULL) | Causes `entities/null.md` | 🟡 Medium |

**Root cause:** DB records where `author_handle` is `NULL` or empty, converted to string `"null"`.

**To fix:**

- Add null-safety check in `queryBookmarks()` or `groupBy()`
- Filter out records where `author_handle` is `null` or empty
- Or use a fallback (e.g., `"unknown"`)

**Priority:** Medium — affects data quality, not core pipeline flow.

---

## Top Candidates for Config-ification

These are the values most likely to need changing or cause issues:

1. **X API query ID** (`graphql.ts`) — changes periodically, currently a blind mutation
2. **X public bearer token** (`graphql.ts`) — rotates, causes silent failures
3. **Feature flags** (`graphql.ts` GRAPHQL_FEATURES) — most frequent source of breakage
4. **LLM model name** (`bases.ts`) — swapped when testing different models
5. **LLM server URL/port** (`bases.ts`) — if port or host changes
6. **Taxonomy** (`config.ts` TYPES/DOMAINS) — adding types needs code change
7. **Paths** (`bases.ts`) — though most are overridable by env vars already

See `AGENTS.md` for project structure and pipeline entry points.

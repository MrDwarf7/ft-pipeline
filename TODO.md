# TODO -- Pipeline Open Issues

Agreed pipeline order: **SYNC -> EXTRACT -> MERGE -> CLASSIFY -> GENERATE -> INDEXES**

Verified against `src/` on **2026-07-20**. Historical "we did X on date Y" write-ups live in
`docs/completed/` and `docs/_fixes/` -- not duplicated here.

---

## Current pipeline status (code reality)

| Step     | Status | Notes                                                                                    |
| -------- | ------ | ---------------------------------------------------------------------------------------- |
| Sync     | OK     | GraphQL + `fetchWithRetry`; envelope Zod; parse split; drop counts / drift hard-fail.    |
| Extract  | OK     | xtracticle Zod + retry; module split; remote article images in clippings.                |
| Merge    | OK     | Clippings -> `clippings_text`; singular/plural type rank fixed.                          |
| Classify | OK     | Per-item settle path; LLM retry + response Zod; empty content throws item-level.         |
| Generate | OK     | Template render from `pipeline.db`.                                                      |
| Indexes  | OK     | Split query/view/render/write; hash caching; primary_* only (multi-label still backlog). |

**Config:** file + env + zod (`config` command). Fail-loud on invalid file; NotFound -> defaults.\
**DB:** sqlite3 CLI runner + `insert`/`upsert`/`update`/`select`/`transaction` (call sites still
mostly `prepare` -- Wave 2).\
**Tests:** `deno task test:unit` -- 92 passed after immediate merge.\
**Dead files:** removed (`options.ts`, `ft-cli.ts`).


---

## Immediate work -- Wave 0 + Wave 1 LANDED

Merged as `merge(immediate): wave0 + wave1 maintainability stack` (see jj log). Details and agent
briefs remain in [`docs/worktrees-immediate.md`](docs/worktrees-immediate.md).

Still open under immediate/Wave 2:

- **WT-db-callers** -- migrate command SQL to table helpers + zod rows
- **WT-integration-tests** -- more fixtures / e2e glue
- **I8 config resolution test** -- skipped (needs injectable load)
- Feature parity (media / folders / LLM fallback) unchanged below

### Historical task list (I0--I9) -- kept for audit; Wave 0/1 items done in code

Maintainability items below were the original checklist. Prefer the status table above + Wave 2.

### I0 -- Classify: actually survive per-item LLM failures

**Intent (product):** One overloaded/local model failure on a single tweet must **log and continue**.
We do **not** want the whole classify step (or full pipeline) to die because one item flaked.

**Code reality today:**

- `processRow` in `src/commands/classify.ts` wraps `classifyRow` in `.catch` -> logs + returns
  `"failed"`.
- `processBatch` maps **`classifyRow` directly** and never calls `processRow` (`processRow` is
  effectively dead; `deno-lint-ignore no-unused-vars`).
- So a throw from `classifyRow` rejects the `Promise.all` and can abort the batch/command.

**Do:**

- [ ] Wire batch processing through the catch path (or inline the same catch); delete unused
      `processRow` lint-ignore dead code.
- [ ] Keep run-level summary: `classified` / `failed` counts + results JSON backup.
- [ ] Confirm `runFull` still continues past classify step failure (desired); polish hints only
      if misleading (data-driven table optional, not blocking).

**Out of scope here:** fail-fast for classify (we do not want that).

---

### I1 -- Delete dead code + doc drift

- [ ] Delete `src/options.ts` (options live on CLI tree; tombstone only).
- [ ] Delete `src/utils/ft-cli.ts` (no importers; throws if called).
- [ ] Update `AGENTS.md` project tree: remove `ft-cli.ts`; fix `cli-schema.ts` ->
      `cli-schema.tree.ts` + `cli-schema.types.ts` (+ `consts.ts` as needed).

---

### I2 -- DB access: safe runner + table helpers (no Prisma)

Stay on Deno + `sqlite3` CLI subprocess. Stop treating the DB as "build a string, hope JSON comes
back." Add the normal-backend helpers this codebase actually needs (one main table, no joins).

**Today (`src/utils/db.ts`):**

- Params interpolated into SQL via quoting (`interpolate`).
- `querySql` uses `.mode json` + `JSON.parse`; **parse failure returns `[]` silently**.
- Call sites cast rows with `as T[]`.

**Target shape (see `docs/worktrees-immediate.md` WT-db + DB API section):**

```text
sqlite3 CLI
  -> runner (bind via .parameter, exec, JSON rows, throw on failure)
  -> Database: prepare/run/all + insert/upsert/update/select + transaction
  -> commands
```

**Do (WT-db core):**

- [ ] Real binds: sqlite3 `.parameter set ?N value` (CLI 3.53+ supports this) -- not string glue.
- [ ] `querySql` / exec: **never** swallow parse or nonzero-exit -- throw with stderr + context.
      Empty result set is still `[]`.
- [ ] Public helpers on `Database` (equality-only `where`; identifiers are our literals only):
  - `insert(table, row)`
  - `upsert(table, row, conflictColumns)`
  - `update(table, set, where)` 
  - `select(table, { columns, where?, orderBy?, limit? })` / `selectOne(...)`
- [ ] Keep `prepare` / `exec` escape hatch for migrate DDL and complex SELECTs (indexes/generate).
- [ ] `transaction(fn)` via BEGIN/COMMIT/ROLLBACK (still CLI).
- [ ] Params always `readonly SqlValue[]` on prepare path -- drop spread-or-array dual API.
- [ ] Tests for binds, empty success, bad JSON throws, upsert/update helpers.
- [ ] Doc-comment the public API (AGENTS doc form).

**Later (WT-db-callers):** migrate sync/extract/merge/classify-db call sites to helpers + zod rows.

**Not doing:** Prisma / drizzle / join builders / relations.

---

### I3 -- Silent `catch {}`: fix the failure mode, not only log

Prefer making the operation correct or failing closed with a typed outcome. Logging alone is not
the goal.

High-signal sites to clear:

| Area | Today | Target |
| ---- | ----- | ------ |
| `db.querySql` JSON parse | `[]` | throw / explicit error |
| extract frontmatter / dir walks | null / skip | distinguish missing file vs corrupt |
| generate "no rows" / missing dir | `[]` / empty set | OK if intentional; don't hide SQL/parse errors behind same path |
| config load | fallback defaults | OK for missing file; fail loud on **invalid** JSONC (zod already helps on parse path -- verify) |

- [ ] Audit every empty `catch` in `src/` and either handle the specific errno/case or rethrow.
- [ ] Pair with I2 so SQL "success with empty" is not confused with "driver failed."

---

### I4 -- Shared HTTP policy: 429 / rate limits / retries

**Today:** GraphQL has 429 + Retry-After + backoff (`extraction/graphql.ts`). Extract (xtracticle)
and LLM client do **not** share that. Config already has `maxRetries` / `retryBaseMs` but they are
not a single middleware.

**Do:**

- [ ] Add a small shared helper (e.g. `src/utils/http.ts` or `fetch-with-retry.ts`): honor 429 +
      `Retry-After`, exponential backoff, max attempts, jitter; return clear errors after exhaustion.
- [ ] Use it for: X GraphQL, xtracticle extract, LLM `/models` + `/chat/completions`.
- [ ] Drive defaults from `CONFIG` (`maxRetries`, `retryBaseMs`) -- callers pass overrides, no
      hidden default params in TS function signatures (project rule).

---

### I5 -- Boundary validation (Zod where we already half-do it)

- [ ] **GraphQL timeline envelope** (`parseResponse`): Zod for
      `data.bookmark_timeline_v2.timeline.instructions` / entries, not only leaf `TweetDataSchema`.
      Log drop counts (seen / parsed / skipped) so silent empty sync is obvious.
- [ ] **xtracticle thread response:** Zod for the shapes extract actually reads (tweet, article
      blocks, cover_media, media_entities) -- kill `as Record` spray in `extract.ts`.
- [ ] **LLM OpenAI-compat responses:** validate `/models` and chat completion JSON; reject empty
      assistant content instead of `""`.
- [ ] Schema-drift **hard fail** when envelope parse fails or a full page yields zero parseable
      tweets while API returned entries (see old "Step 2" -- still valid, re-homed here).

---

### I6 -- Migrations that don't DROP the world

**Today (`migrate.ts`):** magic column counts `21` / `20`; wrong count -> `DROP TABLE bookmarks`.
`migration_runs` table exists but is not a real ordered migration ledger.

**Do:**

- [ ] Versioned migrations (name + applied set); add columns by existence check, not total count.
- [ ] Never DROP user data without an explicit destructive flag.
- [ ] Prepare path for upcoming columns (folders, media paths) without rewrite chaos.

---

### I7 -- Split god-files (brittle multi-concern modules)

Split along pure vs I/O boundaries. No behavior change required in the first pass.

| File | ~LOC | Split toward |
| ---- | ---- | ------------ |
| `commands/extract.ts` | ~566 | client / classifyTweet / clipping writer / db updates |
| `extraction/graphql.ts` | ~412 | fetch+retry / parse envelope / map tweet |
| `commands/indexes.ts` | ~390 | query -> view-model -> markdown -> hash write |

- [ ] extract: also resolve open batching TODO (`allResults` / reduce) while splitting if cheap.
- [ ] Keep public `runExtract` / `runIndexes` / `createGraphQL` entrypoints stable for `main` /
      pipeline.

---

### I8 -- Tests for the risky paths (expand what exists)

Suite already has: `cli-schema_test`, `classify-llm_test`, `schema_test`, `frontmatter_test`,
`hash_test`, plus e2e task. "No tests" in older notes is **stale**.

**Add first (fixtures > mocks):**

- [ ] GraphQL `parseResponse` + pagination/staleness (saved raw JSON fixtures).
- [ ] extract `classifyTweet` + article image URL extraction.
- [ ] merge priority (articles > posts > media).
- [ ] config resolution order (env > file > defaults).
- [ ] `parseDate` edge cases (`utils/datetime.ts`).
- [ ] classify per-item failure does not reject the batch (locks I0).
- [ ] DB helper: bad SQL / bad JSON must not look like empty success (locks I2).

---

### I9 -- LLM client hygiene (local-first, still strict)

Product still allows classify to miss items (I0). Client should not be sloppy.

- [ ] Remove `?? 0.3` / `?? 200` / default `jsonMode` inside `openai-compat` -- caller always passes
      (project: no default params; classify already passes temp/maxTokens).
- [ ] Tiny inference probe after `/models` (optional but useful): prove the model can answer before
      burning a full batch (old "Step 4").
- [ ] LLM **fallback chain** stays in feature backlog (F2), not blocking I0--I8.

---

### Immediate order (linear reference)

I-ids above are the work *content*. **Execution is by worktree area** (next section), not
strictly I0→I9. Linear map for humans:

```
I1 dead code / I0 classify / I2 db / I6 migrate / I4 http-core  -- wave 0 parallel
I3 residual catches (non-owned files)                            -- after wave 0
I4 wire + I5 zod + I9 llm + I7 splits                            -- wave 1 by area
I8 tests                                                         -- land with each area
```

---

## Worktree map (spawn agents here)

Parallel isolation: **one jj workspace per area**, exclusive file ownership, commit only your
filesets, do not merge. Orchestrator reintegrates with `jj new <rev1> <rev2> ...`.

Full agent briefs: [`docs/worktrees-immediate.md`](docs/worktrees-immediate.md).

### Wave 0 -- no cross-deps (spawn all at once)

| Area ID | Maps to | Exclusive own | Do not touch | Done when |
| ------- | ------- | ------------- | ------------ | --------- |
| **WT-hygiene** | I1 | delete `src/options.ts`, `src/utils/ft-cli.ts`; edit `AGENTS.md` (tree only) | any runtime code | files gone; AGENTS tree accurate; `deno task ch:all` |
| **WT-classify** | I0 + I8(classify) | `src/commands/classify.ts`, optional `src/commands/classify*_test.ts` | classify-llm, llm/, pipeline | batch uses catch path; no unused `processRow` lint-ignore; test that throw → `"failed"` not reject; `ch:all` |
| **WT-db** | I2 core + I8(db) | `src/utils/db.ts`, add `src/utils/db_test.ts` | command files (no mass call-site rewrite yet) | binds + throw-on-parse; `insert`/`upsert`/`update`/`select`/`transaction`; prepare/exec escape hatch; tests + API docs; `ch:all` |
| **WT-migrate** | I6 | `src/commands/migrate.ts` | db.ts (use existing API) | no DROP-on-count; column-existence migrations; optional version ledger; `ch:all` |
| **WT-http** | I4 create only | **new** `src/utils/http.ts`, `src/utils/http_test.ts` | graphql/extract/llm (no wire yet) | `fetchWithRetry` (or equiv): 429 + Retry-After, backoff, max attempts, jitter; options **required** from caller (no default params); unit tests; `ch:all` |
| **WT-indexes** | I7 indexes | `src/commands/indexes.ts` → split under e.g. `src/commands/indexes/` or `src/indexes/*` | extract, graphql | pure query/view/markdown/write modules; `runIndexes` entry stable; `ch:all` |
| **WT-tests-pure** | I8 pure | new tests only: `src/utils/datetime_test.ts`, `src/config_test.ts` (or `src/commands/merge_test.ts` for priority) | production logic unless bugfix trivial | tests pass under `deno task test:unit` |

### Wave 1 -- after Wave 0 merged (especially **WT-http** + **WT-db**)

Each area wires shared http + zod + split in **one owner** to avoid dual-edit of big files.

| Area ID | Maps to | Exclusive own | Depends on | Done when |
| ------- | ------- | ------------- | ---------- | --------- |
| **WT-sync** | I4 wire GraphQL + I5 GraphQL envelope + I7 graphql split | `src/extraction/**` (graphql, schema, types, index, tests/fixtures) | WT-http | timeline Zod; drop counts; uses shared fetch retry; optional file split; fixtures/tests; hard-fail on envelope drift; `ch:all` |
| **WT-extract** | I4 wire xtracticle + I5 xtracticle Zod + I7 extract split + extract I3 catches | `src/commands/extract.ts` and any new `src/commands/extract/*` or `src/extraction/xtracticle*.ts` | WT-http | Zod for xtracticle shapes; no cast spray; uses shared retry; split modules; intentional skips typed; batch TODO if cheap; `ch:all` |
| **WT-llm** | I4 wire LLM + I5 LLM Zod + I9 | `src/llm/**`, touch `src/commands/classify-llm.ts` only if call-site must pass explicit chat options | WT-http | no hidden defaults in openai-compat; validated responses; empty content errors; optional probe; uses shared retry; `ch:all` |
| **WT-catches** | I3 residual | `src/config.ts`, `src/commands/generate.ts`, `src/utils/env.ts`, `src/commands/cookies.ts`, `src/utils/logger.ts`, `src/main.ts` as needed | WT-db (don't re-break db) | no silent empty-catch hiding real errors; missing-file vs corrupt distinguished; `ch:all` |

### Wave 2 -- after Wave 1

| Area ID | Maps to | Own | Done when |
| ------- | ------- | --- | --------- |
| **WT-db-callers** | I2 row typing | command DB call sites (`classify-db`, `sync`, `merge`, `generate`, `indexes` queries) -- **serialize or one agent** | zod/parse helpers at boundaries; no bare `as T[]` on query results |
| **WT-integration-tests** | I8 remainder | `tests/`, fixtures under `tests/fixtures/` | merge priority, parseResponse fixtures, extract classifyTweet, e2e smoke if cheap |

### Conflict rules (agents)

1. **Never** edit a file outside your "Exclusive own" list.
2. If you need an API from another area (e.g. `fetchWithRetry`), **import the Wave 0 symbol** after merge -- do not copy-paste retry into graphql/extract/llm.
3. Public entrypoints stay stable: `runExtract`, `runIndexes`, `runClassify`, `createGraphQL`, `getPipelineDb`, `runMigrate`.
4. Project rules: no default params, no lint ignore, no `as` without validation, ASCII comments, `deno task ch:all` before handoff.
5. Classify product rule: per-item failure logs and continues; do **not** make classify fail-fast.

### Suggested jj workspace names

```text
../ft-pipeline_wt_hygiene
../ft-pipeline_wt_classify
../ft-pipeline_wt_db
../ft-pipeline_wt_migrate
../ft-pipeline_wt_http
../ft-pipeline_wt_indexes
../ft-pipeline_wt_tests_pure
# after merge wave 0:
../ft-pipeline_wt_sync
../ft-pipeline_wt_extract
../ft-pipeline_wt_llm
../ft-pipeline_wt_catches
```

---

## Feature backlog (after immediate)

Design docs under `docs/feature-parity/` and `docs/features/`.

| ID | Feature | Status | Doc |
| -- | ------- | ------ | --- |
| F1 | Media download (local files, caps, `FT_MEDIA_DIR`) | Missing | `docs/feature-parity/media-download.md` |
| F2 | LLM fallback provider chain | Missing | feature-parity index |
| F3 | Bookmark folders sync/tags | Missing | `docs/feature-parity/bookmark-folders.md` |
| F4 | Gaps mode / backfill wiring | Missing / partial flags | folders doc |
| F5 | Index multi-type / multi-domain display | Missing | uses primary_* only today |
| F6 | Extract: raw xtracticle JSON archive if truncated | Missing | was Step 3 bullet |
| F7 | Article images as **local** media (not only remote md links) | Partial -- remote links done | B4 + F1 |

**Article images note (verified):** `extractArticleImages` + `buildMediaList` write remote
markdown images into clippings. Remaining work is local download/reliability (F1/F7), not "totally
ignored" as old B4 text claimed.

---

## Explicit non-goals / decisions

| Topic | Decision |
| ----- | -------- |
| Full pipeline continues when a step fails | **Desired** -- log + hints; do not fail-fast the whole `runFull` by default |
| Classify single-item failure | **Must not** kill the run; log and count as failed (I0) |
| Prisma / heavy ORM | **No** -- improve sqlite3 CLI usage (I2) |
| Vitest | Optional later; Deno.test is enough for now |
| Dead ft-cli / options tombstones | **Remove** (I1), do not keep "for reference" |

---

## Done (reference only -- details in docs)

Do not re-litigate these in this file:

- Wiki output under `~/StoneVault/wiki/` (bookmarks/categories/domains/entities/index)
- Own `pipeline.db`, cookies, logs under XDG config
- Generate without ft-cli; hash-based index writes
- Time-based log filenames
- Entity query filters null/empty `author_handle` (`indexes.ts`)
- B1 merge, B2/B3 classify columns/prompt, B5 indexes columns (see `docs/_fixes/`, `docs/completed/`)
- CLI schema split: `cli-schema.types.ts` + `cli-schema.tree.ts`
- Config command + file-backed config

---

## Hard-coded / volatile values (short list)

Full line-number audit was stale; these are the ones that still matter:

| What | Where | Why care |
| ---- | ----- | -------- |
| Bookmarks GraphQL query id + feature flags + public bearer | `extraction/graphql.ts` | X rotates these; silent sync emptiness |
| LLM base URL / model | config / env | Already partly env-driven -- keep it that way |
| TYPES / DOMAINS taxonomy | `config.ts` | Product change requires code/config edit |
| Retry/jitter constants | graphql + config | Should converge on I4 + CONFIG |
| Classify confidence threshold, batch sizes | classify / config | Fine as config knobs |

---

## See also

- `AGENTS.md` -- conventions, pipeline map, taxonomy
- `docs/index.md` -- docs home
- `docs/feature-parity/` -- media, folders, etc.
- `docs/_fixes/` -- historical fix specs (some status text may lag code; trust `src/`)

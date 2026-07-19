# Immediate worktrees -- agent spawn guide

Source of truth for **what**: `TODO.md` (I0--I9).  
Source of truth for **who owns which files / which wave**: this doc.

Orchestrator: create one jj workspace per area, point agent at that cwd, require commit of
**only** listed filesets, reintegrate with merge commits (`jj new rev1 rev2 ...`).

```bash
# example -- from main repo after baseline is committed
jj workspace add ../ft-pipeline_wt_hygiene --revision @
# agent works only inside ../ft-pipeline_wt_hygiene
```

After each area finishes: `deno task ch:all` + relevant tests in that worktree.

---

## Wave 0 (spawn in parallel)

### WT-hygiene

| | |
| -- | -- |
| **Maps** | I1 |
| **Own** | Delete `src/options.ts`, `src/utils/ft-cli.ts`. Edit `AGENTS.md` project tree only. |
| **Avoid** | Runtime TS under `src/commands`, `src/extraction`, `src/llm`, `src/utils` (except deletes). |

**Acceptance**

- [ ] Both dead files gone; no remaining imports (there should be none).
- [ ] AGENTS tree: no `ft-cli.ts`; CLI schema listed as `cli-schema.tree.ts` + `cli-schema.types.ts`.
- [ ] `deno task ch:all` green.

**Agent prompt sketch**

> Delete tombstone `src/options.ts` and dead `src/utils/ft-cli.ts`. Update AGENTS.md structure
> section only. Do not change pipeline behavior. Run `deno task ch:all`. Commit only those paths.

---

### WT-classify

| | |
| -- | -- |
| **Maps** | I0, I8 (classify failure) |
| **Own** | `src/commands/classify.ts`, optional new/updated `src/commands/classify*_test.ts` |
| **Avoid** | `classify-llm.ts`, `llm/`, `pipeline.ts`, `classify-db.ts` unless test forces a tiny export |

**Problem**

`processRow` catches per-item errors; `processBatch` calls `classifyRow` directly so one throw
aborts the batch.

**Acceptance**

- [ ] Every row in a batch goes through a catch path → `"failed"` + log, not rejected Promise.
- [ ] Remove dead `processRow` + `deno-lint-ignore` if inlined, or use `processRow` from batch.
- [ ] Summary counts still report `classified` / `failed`.
- [ ] Unit test: mock/stub path or inject throwing classify so batch does not reject.
- [ ] `deno task ch:all` green.

**Product rule:** do **not** make classify fail-fast on single-item errors.

---

### WT-db

| | |
| -- | -- |
| **Maps** | I2 (core), I8 (db helper) |
| **Own** | `src/utils/db.ts`, add `src/utils/db_test.ts` |
| **Avoid** | Rewriting every command call site (that is Wave 2 **WT-db-callers**) |

#### Target API (implement this)

Stay on **system `sqlite3` CLI** via `Deno.Command`. No Prisma/Drizzle. SQL stays hand-written for
complex cases; everyday CRUD uses helpers.

```ts
type SqlValue = string | number | null;
type Row = Record<string, SqlValue>;

interface Statement {
  run(params: readonly SqlValue[]): void;
  all(params: readonly SqlValue[]): Record<string, unknown>[];
}

interface Database {
  exec(sql: string): void; // trusted SQL only (DDL)
  prepare(sql: string): Statement;
  transaction(fn: (db: Database) => void): void;
  close(): void;

  insert(table: string, row: Row): void;
  upsert(table: string, row: Row, conflict: readonly string[]): void;
  update(table: string, set: Row, where: Row): void;
  select(
    table: string,
    opts: {
      columns: readonly string[];
      where?: Row; // AND equality only
      orderBy?: string; // trusted identifier, not user input
      limit?: number;
    },
  ): Record<string, unknown>[];
  selectOne(
    table: string,
    opts: {
      columns: readonly string[];
      where?: Row;
      orderBy?: string;
    },
  ): Record<string, unknown> | null;
}

getPipelineDb(): Database;
closePipelineDb(): void;
```

**Runner rules**

- Bind with sqlite3 `.parameter init` / `.parameter set ?N value` (not string interpolate for values).
- `.mode json` for SELECT; empty stdout → `[]`; bad JSON or nonzero exit → **throw** (never fake empty).
- Table/column names in helpers are our string literals only; values always bound.
- `params` is always an array (no spread-or-array dual API).
- No default parameters in TypeScript functions.
- Doc-comment public API per AGENTS.md form.
- Example usage to support: sync upsert bookmarks; extract/merge/classify `update` by `tweet_id`.

**Acceptance**

- [ ] Nonzero sqlite3 exit → throw with stderr/context.
- [ ] JSON parse failure → **throw**, never silent `[]`.
- [ ] Empty successful query still returns `[]`.
- [ ] Real `.parameter` binds for values.
- [ ] `insert` / `upsert` / `update` / `select` / `selectOne` / `transaction` implemented.
- [ ] `prepare` / `exec` remain for migrate + complex SELECT.
- [ ] Tests: binds, empty success, bad JSON throws, helper CRUD on temp db file.
- [ ] No Prisma. `deno task ch:all`.

---

## Shared conventions (all worktrees)

- **jj:** commit only your owned filesets; do **not** merge to main; leave real work commit id in the
  final message.
- **Checks:** `deno task ch:all` before handoff; run new/related tests.
- **Style:** AGENTS.md -- no default params, no lint ignore, no bare `as` without zod/validation,
  ASCII in `.ts` comments, doc form for `/** */`.
- **Classify:** per-item failure must log and continue (never fail-fast the whole classify run).

---

### WT-migrate

| | |
| -- | -- |
| **Maps** | I6 |
| **Own** | `src/commands/migrate.ts` |
| **Avoid** | `src/utils/db.ts` (consume API as-is) |

**Acceptance**

- [ ] Remove "column count !== 21 → DROP TABLE" behavior (or gate behind explicit destructive flag
      that default path never sets).
- [ ] Additive migrations by column existence (`PRAGMA table_info`), not magic totals.
- [ ] Use or real-ize `migration_runs` as applied-migration ledger.
- [ ] Fresh DB still creates full schema. Existing good DB is no-op / additive only.
- [ ] `deno task ch:all`.

---

### WT-http

| | |
| -- | -- |
| **Maps** | I4 (library only) |
| **Own** | **New** `src/utils/http.ts`, `src/utils/http_test.ts` |
| **Avoid** | Wiring into graphql/extract/llm (Wave 1 owns wire-up) |

**Acceptance**

- [ ] Export something like `fetchWithRetry(request, policy)` where `policy` includes
      `maxAttempts`, `baseDelayMs`, jitter flag, optional `retryOn` -- **all required by caller**
      (no default params in TS).
- [ ] On 429: honor `Retry-After` when present; else exponential backoff from policy.
- [ ] Exhaustion → Error with status + attempt count (clear message).
- [ ] Unit tests with mock fetch / injected fetch fn.
- [ ] `deno task ch:all`.

**Note:** GraphQL already has local 429 logic -- Wave 1 **WT-sync** will replace it with this
helper. Do not edit graphql in this worktree.

---

### WT-indexes

| | |
| -- | -- |
| **Maps** | I7 (indexes only) |
| **Own** | `src/commands/indexes.ts` and any new modules it is split into (e.g.
  `src/commands/indexes/*.ts` or `src/indexes/*`) |
| **Avoid** | extract, graphql, generate |

**Acceptance**

- [ ] Split along: DB query → view model → markdown render → hash write.
- [ ] `runIndexes` (or current export name) remains the command entry used by main/pipeline.
- [ ] Behavior parity (same pages, hash skip still works).
- [ ] `deno task ch:all`.

---

### WT-tests-pure

| | |
| -- | -- |
| **Maps** | I8 (pure units) |
| **Own** | New test files only (prefer `*_test.ts` next to units) |
| **Avoid** | Changing production code except trivial pure-bug fixes agreed mid-flight |

**Suggested tests**

- `src/utils/datetime_test.ts` -- ISO + Twitter date strings, empty/bad → `ok: false`.
- Config resolution -- env beats file beats defaults (may need small test hooks or temp dirs).
- Merge priority -- if pure helpers are extractable without large merge.ts edit; else leave for
  Wave 2.

**Acceptance:** `deno task test:unit` includes new tests and passes; `ch:all` if any src touch.

---

## Wave 1 (after Wave 0 merge; base = merged @)

### WT-sync

| | |
| -- | -- |
| **Maps** | I4 wire GraphQL, I5 GraphQL Zod, I7 graphql split |
| **Own** | `src/extraction/**` |
| **Depends** | WT-http merged |

**Acceptance**

- [ ] All X fetches use shared `fetchWithRetry` + CONFIG-driven policy (caller passes numbers).
- [ ] Zod for timeline envelope / instructions / entries; leaf tweet schema kept or composed.
- [ ] Log counts: entries seen / parsed / dropped.
- [ ] Hard fail when structure is wrong or page has entries but zero parseable tweets (drift).
- [ ] Optional split: fetch vs parse vs map still under `extraction/`.
- [ ] Fixture tests under `src/extraction/*_test.ts` or `tests/fixtures/graphql/`.
- [ ] `deno task ch:all` + unit tests.

---

### WT-extract

| | |
| -- | -- |
| **Maps** | I4 wire xtracticle, I5 xtracticle Zod, I7 extract split, extract-local I3 |
| **Own** | `src/commands/extract.ts` + new extract/xtracticle modules you create |
| **Depends** | WT-http merged |

**Acceptance**

- [ ] xtracticle HTTP uses shared retry helper.
- [ ] Zod for response shapes used by classifyTweet / article images / text.
- [ ] Remove unnecessary `as Record` paths.
- [ ] Split: client / classify / write clipping / db update (names flexible).
- [ ] `runExtract` entry stable.
- [ ] Empty catch: missing file vs corrupt distinguished where applicable.
- [ ] `deno task ch:all` + tests for classifyTweet + article image URLs.

---

### WT-llm

| | |
| -- | -- |
| **Maps** | I4 wire LLM, I5 LLM response Zod, I9 hygiene |
| **Own** | `src/llm/**`; only if needed `src/commands/classify-llm.ts` for explicit options |
| **Depends** | WT-http merged |

**Acceptance**

- [ ] `/models` and `/chat/completions` use shared retry.
- [ ] No `?? 0.3` / `?? 200` / default jsonMode inside client -- caller passes all.
- [ ] Validate JSON bodies with zod; empty assistant content → throw (item-level catch in classify
      handles it).
- [ ] Optional: short inference probe in `check()` after models list.
- [ ] Fallback provider **chain** is out of scope (feature F2).
- [ ] `deno task ch:all` + tests if practical.

---

### WT-catches

| | |
| -- | -- |
| **Maps** | I3 residual |
| **Own** | `src/config.ts`, `src/commands/generate.ts`, `src/utils/env.ts`,
  `src/commands/cookies.ts`, `src/utils/logger.ts`, `src/main.ts` (only catch-sites) |
| **Depends** | WT-db merged (do not reintroduce silent query parse) |
| **Avoid** | extract/graphql/llm/db (other areas own those catches) |

**Acceptance**

- [ ] Every empty `catch` in owned files: specific errno / intentional skip, or rethrow.
- [ ] Invalid config JSONC fails loud; missing file may still default.
- [ ] `deno task ch:all`.

---

## Wave 2

### WT-db-callers

Row-level zod/parse at command boundaries after db core is strict. Own the command files that
query/update DB (`classify-db.ts`, `sync.ts`, `merge.ts`, query sections of generate/indexes if not
already clean). Prefer **one** agent to avoid conflict.

### WT-integration-tests

Fixtures for GraphQL pages, extract samples, merge priority e2e-ish unit tests, glue tests that
cross modules. Own `tests/**` and fixture JSON only unless a tiny export is required for testability
(coordinate with area owner).

---

## Reintegration checklist (orchestrator)

1. Collect **real work commit ids** from each workspace (not empty workspace `@` placeholders).
2. `jj new <id1> <id2> ...` then `jj describe -m "merge: wave0 immediate ..."`.
3. `deno task ch:all && deno task test:unit` on merged tree.
4. Resolve conflicts preferring area ownership (don't re-break another area's invariants).
5. Remove workspaces when done (`jj workspace list` / project cleanup convention).

---

## Quick status board (tick when merged)

**Wave 0**

- [ ] WT-hygiene
- [ ] WT-classify
- [ ] WT-db
- [ ] WT-migrate
- [ ] WT-http
- [ ] WT-indexes
- [ ] WT-tests-pure

**Wave 1**

- [ ] WT-sync
- [ ] WT-extract
- [ ] WT-llm
- [ ] WT-catches

**Wave 2**

- [ ] WT-db-callers
- [ ] WT-integration-tests

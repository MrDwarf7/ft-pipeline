# TODO -- Pipeline Open Issues

Agreed pipeline order: **SYNC -> EXTRACT -> MERGE -> CLASSIFY -> GENERATE -> INDEXES**

Verified against `src/` on **2026-07-20**. Historical write-ups live in `docs/completed/` and
`docs/_fixes/` -- not duplicated here. Immediate maintainability work (I0--I9 / waves 0-2) is **done
in code**.

---

## Current pipeline status (code reality)

| Step     | Status | Notes                                                                                    |
| -------- | ------ | ---------------------------------------------------------------------------------------- |
| Sync     | OK     | GraphQL + `fetchWithRetry`; envelope Zod; chunk import bisects on failure.               |
| Extract  | OK     | xtracticle Zod + retry; module split; remote article images in clippings.                |
| Merge    | OK     | Clippings -> `clippings_text`; singular/plural type rank fixed.                          |
| Classify | OK     | `settleClassify` per-item; LLM `check()` probe gates the run; empty content item-level.  |
| Generate | OK     | Template render from `pipeline.db`.                                                      |
| Indexes  | OK     | Split query/view/render/write; hash caching; primary_* only (multi-label still backlog). |

**Config:** file + env + zod (`config` command). Fail-loud on invalid file; NotFound -> defaults.
Canonical retry knob is **`maxExternalCallAttempts`** (default **4**, total HTTP attempts for X /
xtracticle / LLM). Legacy `maxRetries` in `config.jsonc` is still accepted and mapped. Shared
`retryBaseMs`.

**DB:** sqlite3 CLI with `insert`/`upsert`/`update`/`select`/`transaction`. `Statement.all` returns
`Record[]` only; callers use `parseRows` + zod (`src/utils/db-rows.ts`). No `.all<T>()`. Complex
WHERE still `prepare`.

**runFull:** continues past non-critical step failures (log + continue); only hard throws mark that
step failed -- remaining steps still run.

**Tests:** unit+integration **122**, e2e **4** (includes config migrate rename tests).\
**Dead files:** removed (`options.ts`, `ft-cli.ts`).

---

## Immediate work -- Wave 0 + Wave 1 + Wave 2 LANDED

| Merge              | Contents                                    |
| ------------------ | ------------------------------------------- |
| `merge(immediate)` | Wave 0+1 maintainability stack              |
| `merge(wave2)`     | db call-site helpers + integration fixtures |

Details (historical briefs): [`docs/worktrees-immediate.md`](docs/worktrees-immediate.md).

**Still open (feature / optional):**

- Config resolution unit test (needs injectable load)
- Feature parity: media download, folders, LLM fallback chain
- Index multi-type/domain display

### Historical task list (I0--I9) -- DONE (audit only)

All items below shipped in waves 0-2. Do not re-open as active work unless code regressed.

| ID | Topic                      | Code reality now                                                                                         |
| -- | -------------------------- | -------------------------------------------------------------------------------------------------------- |
| I0 | Classify per-item failures | `settleClassify` wraps each row; `processBatch` uses `processRow` -> settle; batch does not reject.      |
| I1 | Dead code + doc tree       | `options.ts` / `ft-cli.ts` deleted; CLI schema is `cli-schema.tree.ts` + `cli-schema.types.ts`.          |
| I2 | DB runner + helpers        | binds, throw-on-fail, insert/upsert/update/select/transaction; callers + `db-rows.ts` parseRows/zod.     |
| I3 | Silent empty catches       | Owned catch sites fail loud or typed skip; invalid config fails, missing file may default.               |
| I4 | Shared HTTP retry          | `src/utils/http.ts` `fetchWithRetry`; wired to GraphQL, xtracticle, LLM; `maxExternalCallAttempts`.      |
| I5 | Boundary Zod               | GraphQL envelope, xtracticle, LLM responses; drift hard-fail on empty parseable page with entries.       |
| I6 | Safe migrations            | Column-existence migrations; no DROP-on-magic-count.                                                     |
| I7 | God-file splits            | extract modules, graphql parse split, indexes query/view/render/write.                                   |
| I8 | Tests for risky paths      | Unit + integration fixtures (settleClassify, parse, merge priority, db, etc.).                           |
| I9 | LLM client hygiene         | Explicit call options; response Zod; **intentional** short inference probe in `check()` (gate classify). |

**Product rules that still apply:**

- Classify single-item failure: log + count `"failed"`, do **not** fail-fast the whole run.
- LLM `check()` failure: do **not** start classify batches (probe is intentional type-state).
- `runFull`: log step failure and continue remaining steps.
- No Prisma; stay on sqlite3 CLI helpers.

---

## Feature backlog (after immediate)

Design docs under `docs/feature-parity/` and `docs/features/`.

| ID | Feature                                                      | Status                       | Doc                                       |
| -- | ------------------------------------------------------------ | ---------------------------- | ----------------------------------------- |
| F1 | Media download (local files, caps, `FT_MEDIA_DIR`)           | Missing                      | `docs/feature-parity/media-download.md`   |
| F2 | LLM fallback provider chain                                  | Missing                      | feature-parity index                      |
| F3 | Bookmark folders sync/tags                                   | Missing                      | `docs/feature-parity/bookmark-folders.md` |
| F4 | Gaps mode / backfill wiring                                  | Missing / partial flags      | folders doc                               |
| F5 | Index multi-type / multi-domain display                      | Missing                      | uses primary_* only today                 |
| F6 | Extract: raw xtracticle JSON archive if truncated            | Missing                      | was Step 3 bullet                         |
| F7 | Article images as **local** media (not only remote md links) | Partial -- remote links done | B4 + F1                                   |

**Article images note (verified):** `extractArticleImages` + `buildMediaList` write remote markdown
images into clippings. Remaining work is local download/reliability (F1/F7), not "totally ignored"
as old B4 text claimed.

---

## Explicit non-goals / decisions

| Topic                                     | Decision                                                                    |
| ----------------------------------------- | --------------------------------------------------------------------------- |
| Full pipeline continues when a step fails | **Desired** -- log + hints; do not fail-fast the whole `runFull` by default |
| Classify single-item failure              | **Must not** kill the run; log and count as failed (`settleClassify`)       |
| LLM `check()` probe failure               | **Must** block classify (intentional type-state; not a per-item skip)       |
| Prisma / heavy ORM                        | **No** -- sqlite3 CLI helpers only                                          |
| Vitest                                    | Optional later; Deno.test is enough for now                                 |
| Dead ft-cli / options tombstones          | **Removed** -- do not reintroduce                                           |

---

## Done (reference only -- details in docs)

Do not re-litigate these in this file:

- Wiki output under `~/StoneVault/wiki/` (bookmarks/categories/domains/entities/index)
- Own `pipeline.db`, cookies, logs under XDG config
- Generate without ft-cli; hash-based index writes
- Time-based log filenames
- Entity query filters null/empty `author_handle` (`indexes.ts`)
- B1 merge, B2/B3 classify columns/prompt, B5 indexes columns (see `docs/_fixes/`,
  `docs/completed/`)
- CLI schema split: `cli-schema.types.ts` + `cli-schema.tree.ts`
- Config command + file-backed config
- Immediate waves 0-2 (I0--I9 maintainability stack; see historical table above)

---

## Hard-coded / volatile values (short list)

Full line-number audit was stale; these are the ones that still matter:

| What                                                       | Where                   | Why care                                                                                 |
| ---------------------------------------------------------- | ----------------------- | ---------------------------------------------------------------------------------------- |
| Bookmarks GraphQL query id + feature flags + public bearer | `extraction/graphql.ts` | X rotates these; silent sync emptiness                                                   |
| LLM base URL / model                                       | config / env            | Already partly env-driven -- keep it that way                                            |
| TYPES / DOMAINS taxonomy                                   | `config.ts`             | Product change requires code/config edit                                                 |
| HTTP attempts + backoff                                    | `config.ts`             | `maxExternalCallAttempts` (default 4), `retryBaseMs`; used by GraphQL / xtracticle / LLM |
| Classify confidence threshold, batch sizes                 | classify / config       | Fine as config knobs                                                                     |

---

## See also

- `AGENTS.md` -- conventions, pipeline map, taxonomy
- `docs/index.md` -- docs home
- `docs/feature-parity/` -- media, folders, etc.
- `docs/_fixes/` -- historical fix specs (some status text may lag code; trust `src/`)

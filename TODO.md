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

**DB:** `node:sqlite` (`DatabaseSync`) with `insert`/`upsert`/`update`/`select`/`transaction`.
`Statement.all` returns `Record[]` only; callers use `parseRows` + zod (`src/utils/db-rows.ts`). No
host `sqlite3` CLI; compiles self-contained.

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

- **`renormalize` command (HIGH priority -- maintenance tool):** re-derive every bookmark's on-disk
  filename from `pipeline.db` using the current `buildFilename` convention and rename the file if it
  drifted. Needed whenever the naming format changes (e.g. the `YYYY_MM_DD-DD-` double-day
  regression from the datetime refactor left ~3.1k files with a duplicated numeric day instead of
  the DOW segment). Should be idempotent (no-op when filename already matches), dry-run flag, and
  skip files whose DB row is missing. Lets us change the convention and iterate without
  hand-fiddling renames. See `src/commands/generate.ts::buildFilename` for the canonical format.
  - **Sub-feature: config-driven `dateFormatter` (string template).** Add a `dateFormatter` config
    key holding the filename prefix template (e.g. `{year}_{month}_{day}-{dow}`) so users can
    redefine how the prefix is written without touching code. Current hardcoded format is the
    DEFAULT and the FALLBACK when the key is missing/empty/invalid. `buildFilename` reads the
    template from `CONFIG` and interpolates the `DateParts` fields (`year/month/day/dow/hh/mm/iso`).
    **Migration requirement:** adding this key means a config migration entry — extend
    `CONFIG_KEY_RENAMES` / `applyConfigKeyRenames` (`src/config.ts`) so existing `config.jsonc`
    files that lack `dateFormatter` get it seeded with the default on next `migrateConfigFile` run
    (and `configSchema` gains the optional key with the default applied at load). Must be
    backward-compatible: old configs keep working, new key is additive, never a breaking rename.
- Config resolution unit test (needs injectable load)
- Feature parity: media download, folders, LLM fallback chain
- Index multi-type/domain display
- **Self-contained binary DB:** DONE -- `node:sqlite` backend; no host CLI / no
  `--allow-run=sqlite3`. (`@db/sqlite` FFI segfaulted here and still dlopens a system lib -- not
  used.)
- **Compile startup / size (later perf):** binaries ~90--130MB with Deno runtime inside. Tried
  `deno compile --bundle --minify` (experimental) -- smaller payload but broke with JSON `import` of
  `deno.json` path layout. Revisit when stable; for now `--exclude-unused-npm` only.
- **Move tests out of `src/`:** DONE -- unit tests live under `tests/unit/` (mirrors modules);
  fixtures under `tests/fixtures/`; `deno.json` tasks scan `tests/` only.
- **Package managers (future):** Homebrew / Scoop / Chocolatey / AUR / other distros -- see
  [Packaging / distro distribution](#packaging--distro-distribution-future). In-repo home will be
  `packaging/` (templates); external taps/AUR packages when live.

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
- No Prisma; stay on thin SQLite helpers (`node:sqlite` / `src/utils/db.ts`).

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

## Packaging / distro distribution (future)

**Today:** `deno task install` drops a host binary on `XDG_BIN` / `XDG_BIN_HOME` / `~/.local/bin`
(else leaves `dist/`). CI nightly publishes platform zips on the GitHub `nightly` release from the
**`dev`** tip (tag + `heads/nightly` move with each successful Draft run on `dev`). That is enough
for manual install; package-manager channels are **not** wired yet.

**Wanted later (backlog -- not started):**

| Channel                       | Typical home                                                                  | Notes                                                       |
| ----------------------------- | ----------------------------------------------------------------------------- | ----------------------------------------------------------- |
| Homebrew                      | External tap (`homebrew-ft-pipeline` or similar) + optional formula stub here | Formula can `url` nightly/release assets                    |
| Scoop (Windows)               | Scoop bucket repo or `bucket/` snippet                                        | Point at Windows zip from releases                          |
| Chocolatey                    | `packaging/chocolatey/` nuspec + tools scripts                                | Needs package maintainer + moderation                       |
| AUR (Arch)                    | Usually a **separate** AUR git package; keep a template here                  | `PKGBUILD` + `.SRCINFO` template under packaging            |
| Other distros (deb/rpm/nix/…) | Same packaging tree when we care                                              | Prefer release artifacts over building Deno on every target |

**In-repo layout convention (when we start):**

```
packaging/                 # source-of-truth templates + maintainer notes
  README.md                # which channels are live, how to bump, where external repos live
  aur/                     # PKGBUILD template (publish from separate AUR package repo)
  homebrew/                # formula stub or pointer to the tap
  scoop/                   # bucket manifest template
  chocolatey/              # nuspec + tools/
  # later: deb/, rpm/, nix/ as needed
```

Rationale: most of these channels eventually live in **external** repos (AUR, brew tap, scoop
bucket, choco gallery). Keeping a `packaging/` tree in this repo is the common "templates + docs"
pattern so agents/humans do not invent paths. Do **not** dump formulas into repo root; do not
pretend AUR lives only here.

**Out of scope until someone owns a channel:** auto-publish to every store on every tag. Nightly
GitHub release assets stay the primary binary distribution.

---

## Explicit non-goals / decisions

| Topic                                     | Decision                                                                    |
| ----------------------------------------- | --------------------------------------------------------------------------- |
| Full pipeline continues when a step fails | **Desired** -- log + hints; do not fail-fast the whole `runFull` by default |
| Classify single-item failure              | **Must not** kill the run; log and count as failed (`settleClassify`)       |
| LLM `check()` probe failure               | **Must** block classify (intentional type-state; not a per-item skip)       |
| Prisma / heavy ORM                        | **No** -- thin `node:sqlite` helpers only                                   |
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

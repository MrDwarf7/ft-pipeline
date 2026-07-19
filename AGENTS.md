# FT-Pipeline -- AI Agent Guide

## READ THIS FIRST

If you're an AI agent entering this repo, read this file top-to-bottom before touching anything.
Then check `TODO.md` for what's still open and `docs/_fixes/` for fix specs.

**MANDATORY WORKFLOW:** After every code change, run `deno task ch:all` and ensure all checks pass
before handing back to the user. Fix any new errors immediately -- do not leave the user with
regressions.

## Documentation Standards

- **No unicode symbols in source code.** Em-dashes `--`, en-dashes `--`, smart quotes, etc. are
  banned from `.ts` files. Use plain ASCII: `--` for dashes, `'` and `"` for quotes.
- **Exception:** Unicode is allowed inside template strings that produce user-facing output
  (markdown, wiki pages, log messages displayed to humans).
- **Keep comments lean.** Explain _why_, not _what_. The code shows what it does; a comment explains
  why a choice was made or why it must stay that way. If the code is self-evident, don't comment.
- **No section headers in comments.** Don't use `-- Pure helpers --` or similar banners.
- **Block comments that are NOT docs use `/* */` (single star).** Do not use consecutive `//` lines
  as a substitute for a block comment.

### Doc comments (`/** */`, double star) -- the form is enforced

A doc comment sits directly above the symbol it describes (interface, type, function, const, method,
attribute). Two valid shapes:

**Block form** (multi-line, or one long thought). Pattern:

```
/** first line of text (or `/**` alone, text on the next line)
 *  continuation line(s) -- each begins with ` * ` (space, star, space)
 *
 */
export interface Example { ... }
```

Rules:

- Open with `/**`. The first text may follow on the same line or start on the next line.
- Every continuation line begins with `*` (space, star, space).
- An optional blank doc line (`*` with nothing after the star) MAY sit before the closer. NOTE:
  `deno fmt` strips that blank line -- so its ABSENCE after formatting is correct, not a violation.
  Do not add it back after fmt, and do not treat its absence as non-conformant.
- The comment closes on its own line with `*/`.
- The very next line after `*/` is the documented symbol -- no blank line between the closer and the
  symbol.

**Single-line form.** `/**` and `*/` on the same line:

```
/** Valid keys at the failure point. Empty when the parent was a leaf. */
readonly available: readonly string[];
```

Rules:

- Allowed only when the doc is a single short sentence. "Short" = under a reasonable length, judged
  in this order: the project's average line length, then the formatter's configured max width, then
  "noticeably shorter than that."
- Place it on its own line directly above the symbol, or inline on the same line as the symbol it
  documents.

Canonical examples live in `src/cli-schema.types.ts`: the `LeafCommand` doc (block form) and the
`HelpLookup.available` doc (single-line form).

### File headers

A file's leading doc comment uses the same two shapes: a single-line `/** ... */` when short, or the
block form when it needs more than one line to say what the file is/does. Keep it to what the file
is and does -- not a novel.

### Exempt from the doc form

- **Notable comments** (TODO, HACK, BUG, TEST, FIXME, etc.) are not doc comments. They use the
  single-star block (`/* TODO: ... */`) or `// TODO:` and follow their own marker pattern. They do
  not need to wrap in the block form above.
- **Semantic comments** -- a comment whose only job is to force a layout choice (e.g. force an
  array/object to wrap on purpose, or mark an intentional structure) -- are also exempt. Use `//` or
  `/* */` as the situation needs.

## What This Is

A Deno/TypeScript CLI for processing X/Twitter bookmarks. Full pipeline: Sync -> Extract -> Merge ->
Classify -> Generate -> Indexes. Own GraphQL sync and own `pipeline.db`.

Goal: classify bookmarks by type/domain using a local LLM, generate Obsidian wiki pages.

## Project Structure

```
ft-pipeline/
|-- AGENTS.md              <- YOU ARE HERE. Read this first.
|-- TODO.md                <- Active TODO and backlog
|-- README.md              <- Setup, commands, architecture overview
|-- deno.json              <- Tasks: sync, extract, classify, generate, indexes, full
|-- docs/
|   |-- index.md           <- Docs home
|   |-- completed/         <- Write-ups for completed steps
|   |-- features/          <- Feature docs (GraphQL port, generate, extraction, folders, media)
|   |-- feature-parity/    <- Media download, folders, etc.
|   |-- worktrees-immediate.md <- Immediate waves 0-2 (landed); agent spawn notes
|   |-- _fixes/            <- Historical fix specs (B1-B6)
|-- scripts/
|   |-- run-with-llm.sh    <- LLM server lifecycle management
|-- src/
|   |-- main.ts            <- Entry point, CLI arg parsing, command dispatch
|   |-- cli-schema.tree.ts <- CLI command tree (commands and options)
|   |-- cli-schema.types.ts <- CLI schema types (OptionSpec, LeafCommand, etc.)
|   |-- consts.ts          <- Shared CLI/runtime constants
|   |-- types.ts           <- Command enum, Args interface, parse helpers
|   |-- config.ts          <- Paths, thresholds, taxonomy; maxExternalCallAttempts
|   |-- commands/
|   |   |-- sync.ts        <- GraphQL sync from X -> pipeline.db (chunk import + bisect)
|   |   |-- extract.ts     <- Extract entry; delegates to extract/*
|   |   |-- extract/       <- classifyTweet, clipping write, process batch, db
|   |   |-- merge.ts       <- Clippings enriched text -> DB (clippings_text)
|   |   |-- classify.ts    <- Orchestrator; settleClassify per-item failure path
|   |   |-- classify-db.ts <- DB operations for classification
|   |   |-- classify-llm.ts <- LLM prompt, call, and response parsing
|   |   |-- generate.ts    <- Template-based .md generation from pipeline.db
|   |   |-- indexes.ts     <- Index command entry (runIndexes)
|   |   |-- indexes/       <- query / view / render / write + hash cache
|   |   |-- config.ts      <- Config show/set CLI
|   |   |-- cookies.ts     <- Cookie encryption/decryption for X auth
|   |   |-- help.ts        <- Help text and usage output
|   |   |-- migrate.ts     <- Create/migrate pipeline DB schema
|   |-- extraction/
|   |   |-- index.ts       <- Extraction source interface + factory (type-state)
|   |   |-- graphql.ts     <- X bookmarks GraphQL client (fetchWithRetry)
|   |   |-- parse.ts       <- Timeline envelope parse + drop counts
|   |   |-- schema.ts      <- Zod schemas for GraphQL responses
|   |   |-- xtracticle.ts  <- xtracticle HTTP client (fetchWithRetry)
|   |   |-- xtracticle-schema.ts <- Zod for xtracticle responses
|   |   |-- types.ts       <- Shared types for extraction sources
|   |-- llm/
|   |   |-- index.ts       <- LLM provider interface + factory (check -> ConnectedLLM)
|   |   |-- openai-compat.ts <- OpenAI-compatible client; check() probes inference
|   |   |-- schema.ts      <- Zod for LLM API responses
|   |-- utils/
|       |-- bases.ts       <- App environment + base path resolution (XDG)
|       |-- db.ts          <- node:sqlite DatabaseSync + table helpers
|       |-- db-rows.ts     <- parseRows + zod row schemas (no .all<T>())
|       |-- http.ts        <- Shared fetchWithRetry (429, backoff, max attempts)
|       |-- env.ts         <- Required env var checker + .env loader
|       |-- crypto.ts      <- AES-GCM cookie encryption
|       |-- datetime.ts    <- Date parse helpers
|       |-- frontmatter.ts <- Shared frontmatter parser
|       |-- hash.ts        <- SHA-256 hashing for content comparison
|       |-- logger.ts      <- Structured JSON logger
|       |-- pipeline.ts    <- Pipeline composition and full run orchestration
```

Removed dead modules: old option tombstones and legacy shell helpers (do not reintroduce).

## Tech Stack

- **Runtime:** Deno (no node_modules)
- **Language:** TypeScript
- **DB:** SQLite via Deno `node:sqlite` (`insert`/`upsert`/`update`/`select`/`transaction`)
- **LLM:** Local model via llama-server at `localhost:1234` (OpenAI-compatible)
- **HTTP:** Shared `fetchWithRetry` driven by `CONFIG.maxExternalCallAttempts` + `retryBaseMs`

## Conventions

- **NO default parameters in TypeScript -- PROHIBITED.** User: "default params in any typescript is
  prohibited. The caller ALWAYS has a better understanding of what's happening."
- **NO lint suppression** -- fix the code instead. User: "You need to listen to that shit not ignore
  the lint. Don't silence them - FIX THEM."
- **NO `as` casting without validation** -- use zod for API response parsing
- **NO non-null assertions (`!`)** -- handle null/undefined explicitly
- **Shortname imports only:** `@std/path`, `@std/async/pool` -- never full URLs
- **Builder pattern:** `build()` returns self, `run()` runs it
- **1-2 params max** -- use explicit options interface if more needed
- **Functional style:** arrow functions, iterators (`map`, `filter`, `reduce`), no procedural loops
- **Type-state patterns:** enforce operation ordering (check -> fetch -> process) via separate
  interfaces
- **Fix `no-await-in-loop` with recursion** -- cursor-based pagination uses recursive calls, not
  `while + await`
- **Run `deno task ch:all`** after every code change -- format, check, lint

## Commands

```bash
deno task start <cmd>    # Least-privilege deno run of the CLI
deno task build          # Compile host binary -> dist/ft-pipeline
deno task install        # Build + install to XDG_BIN / XDG_BIN_HOME / ~/.local/bin
deno task ch:all         # fmt + check + lint (required after code changes)
deno task test:unit      # unit + integration tests
```

There is **no** `deno task migrate` / `sync` / `full`. After install, run `ft-pipeline <cmd>` (or
`deno task start <cmd>` / `./dist/ft-pipeline <cmd>`).

## Branches (jj bookmarks)

| Bookmark  | Role                                                                 |
| --------- | -------------------------------------------------------------------- |
| `dev`     | Day-to-day tip. CI Format/Test/Build + **nightly** release track it. |
| `main`    | Stable / release line. Tag `v*` drafts still ship from tags.         |
| `nightly` | Auto-moved by CI to match the latest successful `dev` nightly build. |

GitHub default branch can stay `main`. Work and push on `dev` unless cutting a release.

## Pipeline Status

Verified against `src/` post-refactor (immediate waves 0-2). See `TODO.md` for feature backlog.

```
Pipeline: SYNC -> EXTRACT -> MERGE -> CLASSIFY -> GENERATE -> INDEXES
```

| Step     | Status | Notes                                                                                         |
| -------- | ------ | --------------------------------------------------------------------------------------------- |
| Sync     | OK     | GraphQL + `fetchWithRetry` + envelope Zod; chunk import; fail bisects ("as many as possible") |
| Extract  | OK     | xtracticle Zod + retry; module split under `commands/extract/`; remote article images         |
| Merge    | OK     | Clippings -> `clippings_text`; singular/plural type rank                                      |
| Classify | OK     | `settleClassify` per-item; LLM `check()` probe is intentional type-state gate                 |
| Generate | OK     | Template render from `pipeline.db`                                                            |
| Indexes  | OK     | Split query/view/render/write; hash cache; primary_* only (multi-label backlog)               |

**Config:** `maxExternalCallAttempts` (default 4) = total HTTP attempts for X / xtracticle / LLM.
Legacy `maxRetries` in `config.jsonc` is still accepted and mapped. Shared `retryBaseMs`.

**DB:** `node:sqlite` with `insert`/`upsert`/`update`/`select`/`transaction`. `Statement.all`
returns `Record[]` only -- callers use `parseRows` + zod (`src/utils/db-rows.ts`). No `.all<T>()`.

**runFull:** continues past non-critical step failures (logs + continues); only hard throws fail the
process for that step -- remaining steps still run.

**Open items:** feature parity backlog (media download, folders, LLM fallback chain, multi-label
indexes, injectable config unit test). See `TODO.md`.

## Pipeline Flow

1. **SYNC:** Native GraphQL client -> pipeline.db
   - Decrypts X session cookies (AES-GCM)
   - Fetches bookmarks via X GraphQL API (`fetchWithRetry` + envelope Zod)
   - Imports in transactions per chunk; on failure bisects so good rows still land
   - Writes to our own `pipeline.db`

2. **EXTRACT:** xtracticle.com API -> StoneVault/Clippings/
   - Fetches each tweet via xtracticle (Zod + retry)
   - Classifies into X-Articles / X-Posts / X-Media
   - Writes .md files with frontmatter to Clippings/
   - Updates DB: clipping_path, content_type, extract_status

3. **MERGE:** Clippings -> DB (clippings_text column)
   - Reads all .md files from Clippings/
   - Matches by tweet_id; type rank handles singular/plural labels
   - Priority: articles > posts > media
   - Stores enriched text in clippings_text (cap 5000 chars)

4. **CLASSIFY:** DB -> Local LLM -> DB
   - LLM factory `check()` includes an inference probe -- if check fails, classify must not run
   - Per-item failures go through `settleClassify` (log + `"failed"`, batch continues)
   - Uses clippings_text when available (falls back to text)
   - Writes: primary_type, primary_domain, types, domains, confidence

5. **GENERATE:** DB -> md pages in ~/StoneVault/wiki/bookmarks/
   - Template closures render bookmark stubs directly from pipeline.db

6. **INDEXES:** DB -> index pages with cross-links and entity summaries
   - Modules: query -> view -> render -> write
   - Category, domain, entity pages + master index
   - SHA-256 hash comparison before writing (saves I/O)

## Architecture

**Single database:** `~/.config/ft-pipeline/pipeline.db` -- our canonical DB. Full schema we
control, migrations on demand. We no longer depend on ft's database.

## Key Paths

- **Pipeline DB:** `~/.config/ft-pipeline/pipeline.db` (XDG config dir)
- **Config root:** `~/.config/ft-pipeline/` (XDG_CONFIG_HOME)
- **Clippings:** `~/StoneVault/Clippings/`
- **Wiki output:** `~/StoneVault/wiki/` (bookmarks/, categories/, domains/, entities/, index.md)
- **LLM:** `http://localhost:1234/v1/chat/completions` (llama-server)
- **Config:** `src/config.ts` -- paths, thresholds, taxonomy, `maxExternalCallAttempts` /
  `retryBaseMs`
- **Scripts:** `scripts/run-with-llm.sh`

## Required Environment Variables

The sync and full commands require these env vars. The pipeline checks for them at startup and exits
with a clear error listing any that are missing.

| Variable               | Required   | Description                                              |
| ---------------------- | ---------- | -------------------------------------------------------- |
| `FT_COOKIES_PATH`      | Sync, Full | Absolute path to the encrypted `.sync-cookies.enc` file. |
| `FT_PIPELINE_PASSWORD` | Sync, Full | Password to decrypt the cookies file.                    |

Example setup:

```bash
export FT_COOKIES_PATH="/home/dwarf/.config/ft-pipeline/.sync-cookies.enc"
export FT_PIPELINE_PASSWORD="your-password-here"
```

You can put these in a `.env` file in the project root and source it:

```bash
source .env
```

The env check runs before anything else via `src/utils/env.ts` -> `assertEnvVars()`. It also loads
`.env` from the config directory at module init time.

## Content Classification Rules (extract)

classifyTweet checks what xtracticle returns for the tweet:

1. **Media only** (short/no text, no article) -> X-Media
2. **Article blocks from xtracticle OR long text (>=200 chars)** -> X-Articles
3. **Short text, no article, no media** -> X-Posts

Article+media goes to X-Articles (media doesn't override content type).

## Taxonomy (classify)

**Types:** tool, technique, launch, research, opinion, security, news, meme-shitpost, tutorial,
resource

**Domains:** agentic, ai-ml, security, devops, programming, geopolitics, conspiracy, health,
finance, crypto, media, culture, science

Each bookmark gets ONE primary_type and ONE primary_domain. Multi-label allowed in arrays.

Critical rules:

- `crypto` is CONTAINED -- do NOT bleed into finance
- `geopolitics` != `conspiracy` -- elections/wars vs UFOs/cover-ups
- `agentic` generalizes Claude Code, OpenClaw, Hermes, etc.
- `meme-shitpost` type overrides domain priority

## DB Schema

```sql
CREATE TABLE bookmarks (
  tweet_id          TEXT PRIMARY KEY,
  url               TEXT,
  text              TEXT,
  author_handle     TEXT,
  author_name       TEXT,
  posted_at         TEXT,
  links_json        TEXT,
  media_count       INTEGER DEFAULT 0,

  -- Extraction status
  clipping_path     TEXT,
  content_type      TEXT,           -- 'article' | 'post' | 'media'
  extract_status    TEXT,           -- 'extracted' | 'empty' | '404' | 'no_tweets' | 'error'

  -- Enrichment from clippings
  clippings_text    TEXT,
  clippings_type    TEXT,
  clippings_merged_at TEXT,

  -- Classification results
  primary_type      TEXT,
  primary_domain    TEXT,
  types             TEXT,           -- JSON array
  domains           TEXT,           -- JSON array
  confidence        REAL,
  classified_at     TEXT,

  -- Sync metadata
  synced_at         TEXT
);
```

This is OUR database. `src/commands/migrate.ts` creates it. We own it entirely.

## xtracticle Response Structure

```json
{
  "tweets": [
    {
      "url": "",
      "id": "",
      "text": "",
      "raw_text": { "text": "" },
      "author": { "screen_name": "", "name": "" },
      "likes": 0,
      "bookmarks": 0,
      "views": 0,
      "is_note_tweet": false,
      "article": {
        "title": "",
        "preview_text": "",
        "content": { "blocks": [], "entityMap": {} }
      },
      "media": {
        "all": [{ "type": "video|photo|animated_gif", "url": "" }]
      }
    }
  ]
}
```

Key gotchas:

- `tweet.text` is often empty for X Articles (content lives in `article.content.blocks`)
- `tweet.media.all` = direct tweet media, separate from article media
- Article images live in `article.cover_media.media_info.original_img_url` and
  `article.media_entities`
- xtracticle response may be truncated by API -- save raw JSON, process after

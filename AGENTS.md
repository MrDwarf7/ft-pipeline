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

A Deno/TypeScript CLI for processing X/Twitter bookmarks from the `ft` CLI. Full pipeline: Sync ->
Extract -> Merge -> Classify -> Generate -> Indexes.

2204 bookmarks in a local SQLite DB. Goal: classify them by type/domain using a local LLM, generate
Obsidian wiki pages.

## Project Structure

```
ft-pipeline/
|-- AGENTS.md              <- YOU ARE HERE. Read this first.
|-- TODO.md                <- Active TODO and backlog
|-- README.md              <- Setup, commands, architecture overview
|-- deno.json              <- Tasks: sync, extract, classify, generate, indexes, full
|-- docs/
|   |-- index.md           <- Docs home
|   |-- completed/         <- Write-ups for completed steps (merge, classify, indexes, sync-refactor)
|   |-- features/          <- In-housing plan: F0-F4 feature docs (GraphQL port, generate, extraction, folders, media)
|   |-- _fixes/            <- Fix specs (B1-B6, most done)
|-- scripts/
|   |-- run-with-llm.sh    <- LLM server lifecycle management
|-- src/
|   |-- main.ts            <- Entry point, CLI arg parsing, command dispatch
|   |-- cli-schema.tree.ts <- CLI command tree (commands and options)
|   |-- cli-schema.types.ts <- CLI schema types (OptionSpec, LeafCommand, etc.)
|   |-- types.ts           <- Command enum, Args interface, parse helpers
|   |-- config.ts          <- All paths, thresholds, taxonomy constants
|   |-- commands/
|   |   |-- sync.ts        <- Native GraphQL sync from X -> pipeline.db
|   |   |-- extract.ts     <- xtracticle.com API -> Clippings/*.md + DB update
|   |   |-- merge.ts       <- Clippings enriched text -> DB (clippings_text)
|   |   |-- classify.ts    <- Orchestrator for LLM classification
|   |   |-- classify-db.ts <- DB operations for classification
|   |   |-- classify-llm.ts <- LLM prompt, call, and response parsing
|   |   |-- generate.ts    <- Template-based .md file generation from pipeline.db
|   |   |-- indexes.ts     <- Category/domain/entity index page generation
|   |   |-- cookies.ts     <- Cookie encryption/decryption for X auth
|   |   |-- help.ts        <- Help text and usage output
|   |   |-- migrate.ts     <- Create/migrate our own pipeline DB schema
|   |-- extraction/
|   |   |-- index.ts       <- Extraction source interface + factory (type-state pattern)
|   |   |-- graphql.ts     <- GraphQL client for X bookmarks API
|   |   |-- schema.ts      <- Zod schemas for GraphQL response validation
|   |   |-- types.ts       <- Shared types for extraction sources
|   |-- llm/
|   |   |-- index.ts       <- LLM provider interface + factory
|   |   |-- openai-compat.ts <- OpenAI-compatible API client (llama-server)
|   |-- utils/
|       |-- bases.ts       <- App environment + base path resolution (XDG)
|       |-- db.ts          <- Pipeline DB singleton via sqlite3 CLI subprocess
|       |-- env.ts         <- Required env var checker + .env loader
|       |-- crypto.ts      <- AES-GCM cookie encryption
|       |-- frontmatter.ts <- Shared frontmatter parser
|       |-- hash.ts        <- SHA-256 hashing for content comparison
|       |-- logger.ts      <- Structured JSON logger
|       |-- pipeline.ts    <- Pipeline composition and full run orchestration
```

## Tech Stack

- **Runtime:** Deno (no node_modules)
- **Language:** TypeScript
- **DB:** SQLite via `sqlite3` CLI subprocess
- **LLM:** Local model via llama-server at `localhost:1234` (OpenAI-compatible)

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
deno task start          # Run pipeline with default command
deno task migrate        # Create/migrate pipeline DB schema (run first)
deno task sync           # Sync bookmarks from X via native GraphQL client
deno task extract        # Pull content from xtracticle.com API -> Clippings/
deno task merge          # Merge Clippings enriched text back into DB
deno task classify       # LLM classification (type + domain) -> DB
deno task generate       # Template-based .md generation from pipeline.db
deno task indexes        # Generate category/domain index pages
deno task full           # Run entire pipeline end-to-end
```

## Pipeline Status

What the code actually does vs. what was agreed. See `TODO.md` for the full audit and `docs/_fixes/`
for fix specs.

```
Pipeline: SYNC -> EXTRACT -> MERGE -> CLASSIFY -> GENERATE -> INDEXES
```

| Step     | Status | What's wrong                                                   | Fix doc       |
| -------- | ------ | -------------------------------------------------------------- | ------------- |
| Sync     | OK     | Native GraphQL client, no ft-cli dependency                    | --            |
| Extract  | OK     | Patched (query + classifyTweet). Article images still missing. | B4            |
| Merge    | OK     | Fully implemented -- reads Clippings, enriches DB              | B1 (done)     |
| Classify | OK     | System prompt, JSON schema, enrichment fallback                | B2, B3 (done) |
| Generate | OK     | Template closures, pure functions, no ft-cli                   | --            |
| Indexes  | OK     | Category/domain/entity pages with hash-based caching           | B5 (done)     |

**Open items:** See `TODO.md` for feature parity backlog (media download, bookmark folders, LLM
fallback, tests).

## Pipeline Flow

1. **SYNC:** Native GraphQL client -> pipeline.db
   - Decrypts X session cookies (AES-GCM)
   - Fetches bookmarks via X GraphQL API directly
   - Writes to our own `pipeline.db` (no ft-cli dependency)

2. **EXTRACT:** xtracticle.com API -> StoneVault/Clippings/
   - Fetches each tweet via xtracticle.com/api/thread/{tweet_id}
   - Classifies into X-Articles / X-Posts / X-Media
   - Writes .md files with frontmatter to Clippings/
   - Updates DB: clipping_path, content_type, extract_status

3. **MERGE:** Clippings -> DB (clippings_text column)
   - Reads all .md files from Clippings/
   - Matches by tweet_id, priority: articles > posts > media
   - Stores enriched text in clippings_text (cap 5000 chars)

4. **CLASSIFY:** DB -> Local LLM -> DB
   - Uses clippings_text when available (falls back to text)
   - Sends to local model via llama-server
   - Writes: primary_type, primary_domain, types, domains, confidence
   - Uses our own pipeline.db

5. **GENERATE:** DB -> md pages in ~/StoneVault/wiki/bookmarks/
   - Template closures render bookmark stubs directly from pipeline.db
   - No ft-cli dependency

6. **INDEXES:** DB -> index pages with cross-links and entity summaries
   - Category, domain, entity pages
   - Master index
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
- **Config:** `src/config.ts` -- all paths, thresholds, taxonomy
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

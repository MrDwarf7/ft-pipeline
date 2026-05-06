# FT-Pipeline — AI Agent Guide

## READ THIS FIRST

If you're an AI agent entering this repo, read this file top-to-bottom before touching anything.
Then check `TODO.md` for what's broken and `_fixes/` for the actual fix specs.

**MANDATORY WORKFLOW:** After every code change, run `deno task ch:all` and ensure all checks pass
before handing back to the user. Fix any new errors immediately — do not leave the user with
regressions.

## What This Is

A Deno/TypeScript CLI for processing X/Twitter bookmarks from the `ft` CLI. Full pipeline: Sync →
Extract → Merge → Classify → Generate → Indexes.

2204 bookmarks in a local SQLite DB. Goal: classify them by type/domain using a local LLM, generate
Obsidian wiki pages.

## Project Structure

```
ft-pipeline/
├── AGENTS.md              ← YOU ARE HERE. Read this first.
├── TODO.md                ← Full pipeline audit. Every function vs. the agreed plan.
├── docs/
│   └── features/         ← In-housing plan: F0-F4 feature docs (GraphQL port, generate, extraction, folders, media).
├── _fixes/                ← Detailed fix specs (numbered by priority)
│   ├── B1-merge-step-missing.md        P1 — Critical
│   ├── B2-classify-wrong-columns.md    P1 — Critical
│   ├── B3-classify-prompt-incomplete.md   P2 — Important
│   ├── B4-extract-article-images.md    P2 — Important
│   └── B5-indexes-wrong-columns.md     P2 — Important
├── main.ts                ← Entry point, CLI arg parsing, command dispatch
├── pipeline.ts            ← Pipeline composition (full run orchestration)
├── config.ts              ← All paths, thresholds, taxonomy constants
├── types.ts               ← Command enum, Args interface, parse helpers
├── deno.json              ← Tasks: sync, extract, classify, generate, indexes, full
├── commands/
│   ├── sync.ts            ← ft CLI sync (GraphQL bookmarks)
│   ├── extract.ts         ← xtracticle.com API → Clippings/*.md + DB update
│   ├── classify.ts        ← Local LLM classification → DB
│   ├── generate.ts        ← Delegates to `ft md --force` (re-gen existing stubs)
│   ├── indexes.ts         ← Category/domain index page generation
│   └── cookies.ts         ← Cookie encryption/decryption for X auth
├── llm/
│   ├── index.ts           ← LLM client abstraction
│   └── openai-compat.ts   ← OpenAI-compatible API client (llama-server)
└── utils/
    ├── logger.ts           ← Structured logging
    ├── crypto.ts           ← AES-GCM cookie encryption
    └── frontmatter.ts      ← YAML frontmatter parser
```

## Tech Stack

- **Runtime:** Deno (no node_modules)
- **Language:** TypeScript
- **DB:** SQLite via `@db/sqlite` (Deno FFI)
- **LLM:** Local Gemma 4 E4B via llama-server at `localhost:1234` (OpenAI-compatible)

## Commands

```bash
deno task sync        # Sync bookmarks from X via ft CLI (requires password)
deno task extract     # Pull content from xtracticle.com API → Clippings/
deno task classify    # LLM classification (type + domain) → DB
deno task generate    # Regenerate bookmark md files via ft CLI
deno task indexes     # Generate category/domain index pages
deno task full        # Run entire pipeline end-to-end
```

## Current Pipeline Status

What the code actually does vs. what was agreed. See `TODO.md` for the full audit and `_fixes/` for
step-by-step fix instructions.

```
Agreed:   SYNC → EXTRACT → MERGE → CLASSIFY → GENERATE → INDEXES
Actual:   SYNC → EXTRACT → (nothing) → CLASSIFY → ft md → index pages
```

| Step     | Status | What's wrong                                                   | Fix doc |
| -------- | ------ | -------------------------------------------------------------- | ------- |
| Sync     | ✅     | Works                                                          | —       |
| Extract  | ✅     | Patched (query + classifyTweet). Article images still missing. | B4      |
| Merge    | ❌     | **Missing entirely.** Not in Command enum, no task, no code.   | B1      |
| Classify | ⚠️     | Writes ft's old columns, no system prompt, no enrichment.      | B2, B3  |
| Generate | ⚠️     | Just re-runs `ft md --force`, doesn't create planned pages.    | —       |
| Indexes  | ⚠️     | Reads ft's old columns, no entity pages, no cross-links.       | B5      |

**Fix dependency chain:** B1 → B2 → B3 → B5 (merge feeds classify, classify writes our*\* columns,
indexes reads our*\*). B4 is independent.

## Agreed Pipeline Flow

The full spec lives in `_archive/classification-plan.md` (586 lines). Here's the executive summary:

```
1. SYNC: ft CLI GraphQL → bookmarks.db
   - Decrypts X session cookies
   - Runs `pnpm start sync` in fieldtheory-cli

2. EXTRACT: xtracticle.com API → StoneVault/Clippings/
   - Fetches each tweet via xtracticle.com/api/thread/{tweet_id}
   - Classifies into X-Articles / X-Posts / X-Media
   - Writes .md files with frontmatter to Clippings/
   - Updates DB: clipping_path, content_type

3. MERGE: Clippings → DB (clippings_text column)
   - Reads all .md files from Clippings/
   - Matches by tweet_id, priority: articles > posts > media
   - Stores enriched text in clippings_text (cap 5000 chars)

4. CLASSIFY: DB → Local LLM → DB
   - Uses clippings_text when available (falls back to text)
   - Sends to local Gemma via llama-server
   - Writes: primary_type, primary_domain, types, domains, confidence
   - Uses our own pipeline.db — ft's DB untouched

5. GENERATE: DB → md pages in ~/.ft-bookmarks/md/
   - Bookmark stubs, domain pages, category pages, entity pages, master index

6. INDEXES: DB → index pages with cross-links and entity summaries
```

## Architecture

**Two databases:**

- `~/.ft-bookmarks/bookmarks.db` — ft's DB, READ-ONLY. We never touch it.
- `~/.ft-bookmarks/pipeline.db` — ours. Full schema we control, migrations on demand.

Sync copies bookmarks from ft's DB into ours. Everything else reads/writes pipeline.db.

## Key Paths

- **ft DB (read-only):** `~/.ft-bookmarks/bookmarks.db`
- **Pipeline DB (ours):** `~/.ft-bookmarks/pipeline.db`
- **Clippings:** `/home/dwarf/StoneVault/Clippings/`
- **LLM:** `http://localhost:1234/v1/chat/completions` (Gemma 4 E4B)
- **Config:** `config.ts` — all paths, thresholds, taxonomy
- **FT CLI:** `~/Documents/GitHub_Projects/JavaScript/fieldtheory-cli`
- **md output:** `~/.ft-bookmarks/md/`

## Required Environment Variables

The sync and full commands require these env vars. The pipeline checks for them at startup and exits
with a clear error listing any that are missing.

| Variable               | Required   | Description                                                                                                                                           |
| ---------------------- | ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `FT_COOKIES_PATH`      | Sync, Full | **Absolute path** to the encrypted `.sync-cookies.enc` file. Decouples cookies location from `$HOME` so the pipeline works in sandboxed environments. |
| `FT_PIPELINE_PASSWORD` | Sync, Full | Password to decrypt the cookies file.                                                                                                                 |

Example setup:

```bash
export FT_COOKIES_PATH="/home/dwarf/.ft-bookmarks/.sync-cookies.enc"
export FT_PIPELINE_PASSWORD="your-password-here"
```

You can put these in a `.env` file in the project root and source it:

```bash
source .env
```

The env check runs before anything else via `utils/env.ts` → `assertEnvVars()`. This utility takes a
list of env var names and throws immediately if any are empty/missing.

## Content Classification Rules (extract)

classifyTweet checks what xtracticle returns for the tweet:

1. **Media only** (short/no text, no article) → X-Media
2. **Article blocks from xtracticle OR long text (≥200 chars)** → X-Articles
3. **Short text, no article, no media** → X-Posts

Article+media goes to X-Articles (media doesn't override content type).

## Taxonomy (classify)

**Types:** tool, technique, launch, research, opinion, security, news, meme-shitpost, tutorial,
resource

**Domains:** agentic, ai-ml, security, devops, programming, geopolitics, conspiracy, health,
finance, crypto, media, culture, science

Each bookmark gets ONE primary_type and ONE primary_domain. Multi-label allowed in arrays.

Critical rules:

- `crypto` is CONTAINED — do NOT bleed into finance
- `geopolitics` ≠ `conspiracy` — elections/wars vs UFOs/cover-ups
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
  clipping_path     TEXT,
  content_type      TEXT,           -- 'article' | 'post' | 'media'
  clippings_text    TEXT,
  clippings_type    TEXT,
  clippings_merged_at TEXT,
  primary_type      TEXT,
  primary_domain    TEXT,
  types             TEXT,           -- JSON array
  domains           TEXT,           -- JSON array
  confidence        REAL,
  classified_at     TEXT,
  synced_at         TEXT
);
```

This is OUR database. `migrate.ts` creates it. We never touch ft's bookmarks.db.

## xtracticle Response Structure

```json
{
  "tweets": [{
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
  }]
}
```

Key gotchas:

- `tweet.text` is often empty for X Articles (content lives in `article.content.blocks`)
- `tweet.media.all` = direct tweet media, separate from article media
- Article images live in `article.cover_media.media_info.original_img_url` and
  `article.media_entities`
- xtracticle response may be truncated by API — save raw JSON, process after

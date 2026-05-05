# ft-pipeline Docs — Index

Quick lookup for completed features and project documentation.

## Completed Features

| Feature                                                     | Status | Write-up                                                      | Date       |
| ----------------------------------------------------------- | ------ | ------------------------------------------------------------- | ---------- |
| **MERGE** — Clippings → DB enrichment                       | ✅     | [docs/completed/merge.md](completed/merge.md)                 | 2026-05-05 |
| **CLASSIFY** — LLM classification (type + domain)           | ✅     | [docs/completed/classify.md](completed/classify.md)           | 2026-05-05 |
| **INDEXES** — Category/domain/entity pages                  | ✅     | [docs/completed/indexes.md](completed/indexes.md)             | 2026-05-05 |
| **Sync & Generate Refactor** — ftDir → config, runFtCommand | ✅     | [docs/completed/sync-refactor.md](completed/sync-refactor.md) | 2026-05-05 |

## Pipeline Steps (Quick Reference)

| Step     | Command                    | Description                                              | Status               |
| -------- | -------------------------- | -------------------------------------------------------- | -------------------- |
| SYNC     | `deno task sync`           | Sync X bookmarks via ft CLI → import to pipeline.db      | ✅                   |
| EXTRACT  | `deno task start extract`  | Fetch content from xtracticle API → write Clippings/*.md | ✅ (patched)         |
| MERGE    | `deno task merge`          | Merge Clippings text → pipeline.db `clippings_text`      | ✅                   |
| CLASSIFY | `deno task start classify` | LLM classification (type + domain) via Gemma             | ✅                   |
| GENERATE | `deno task start generate` | Generate md pages via ft CLI                             | ⚠️ (delegates to ft) |
| INDEXES  | `deno task start indexes`  | Generate category/domain/entity index pages              | ✅                   |

Full pipeline: `deno task full`

## Config Reference

See [src/config.ts](../src/config.ts) for all configuration options.

**Key env vars:**

- `FT_PIPELINE_HOME` — pipeline home (fallback: `$HOME`)
- `FT_CLI_DIR` — fieldtheory-cli directory
- `FT_COOKIES_PATH` — encrypted cookies file (for sync)
- `FT_PIPELINE_PASSWORD` — decryption password
- `FT_CLIPPINGS_BASE` — Clippings directory
- `FT_MARKDOWN_DIR` — md output directory

## Fix Specs

See [`_fixes/`](../_fixes/) for detailed fix specifications on remaining issues:

- `B1-merge-step-missing.md` — ✅ DONE (merged into pipeline)
- `B2-classify-wrong-columns.md` — ✅ DONE (schema-aligned)
- `B3-classify-prompt-incomplete.md` — ✅ DONE (system prompt added)
- `B4-extract-article-images.md` — ⚠️ OPEN (article images not captured)
- `B5-indexes-wrong-columns.md` — ✅ DONE (now reads correct columns)

## Project Files

| File                                    | Description                                   |
| --------------------------------------- | --------------------------------------------- |
| [`TODO.md`](../TODO.md)                 | Active TODO list with current status          |
| [`AGENTS.md`](../AGENTS.md)             | Project structure, pipeline spec, conventions |
| [`src/config.ts`](../src/config.ts)     | All paths and settings                        |
| [`src/main.ts`](../src/main.ts)         | CLI entry point                               |
| [`src/pipeline.ts`](../src/pipeline.ts) | Pipeline orchestration                        |
| [`src/commands/`](../src/commands/)     | All pipeline step implementations             |
| [`src/utils/`](../src/utils/)           | Shared utilities (logger, ft-cli, env, etc.)  |
| [`src/llm/`](../src/llm/)               | LLM client abstraction (OpenAI-compatible)    |

# ft-pipeline Docs -- Index

## Completed Features

| Feature                                                      | Status | Write-up                                            | Date       |
| ------------------------------------------------------------ | ------ | --------------------------------------------------- | ---------- |
| **SYNC** -- native GraphQL                                   | Done   | --                                                  | 2026-06-05 |
| **MERGE** -- Clippings -> DB enrichment                      | Done   | [docs/completed/merge.md](completed/merge.md)       | 2026-05-05 |
| **CLASSIFY** -- LLM classification (type + domain)           | Done   | [docs/completed/classify.md](completed/classify.md) | 2026-05-05 |
| **GENERATE** -- template-based markdown                      | Done   | --                                                  | 2026-06-05 |
| **INDEXES** -- category/domain/entity pages                  | Done   | [docs/completed/indexes.md](completed/indexes.md)   | 2026-05-05 |
| **Config refactor** -- XDG on Linux, env-paths elsewhere     | Done   | --                                                  | 2026-06-12 |
| **Direct wiki output** -- pipeline writes to StoneVault/wiki | Done   | --                                                  | 2026-06-12 |

## Pipeline Steps

| Step     | Command              | Description                        | Status |
| -------- | -------------------- | ---------------------------------- | ------ |
| SYNC     | `deno task sync`     | GraphQL sync from X -> pipeline.db | Done   |
| EXTRACT  | `deno task extract`  | xtracticle API -> Clippings/*.md   | Done   |
| MERGE    | `deno task merge`    | Clippings text -> pipeline.db      | Done   |
| CLASSIFY | `deno task classify` | Local LLM classification           | Done   |
| GENERATE | `deno task generate` | Template-based .md generation      | Done   |
| INDEXES  | `deno task indexes`  | Category/domain/entity index pages | Done   |

Full pipeline: `deno task full`

## Planned Features

| Feature                | Why                                        | Status  |
| ---------------------- | ------------------------------------------ | ------- |
| **Media download**     | Download tweet media to `_Attachments/`    | Missing |
| **Bookmark folders**   | Sync X folder structure, tag bookmarks     | Missing |
| **LLM fallback chain** | Primary local + ordered fallback providers | Missing |
| **Test suite**         | Deno test + vitest, critical path coverage | Missing |

Details: [docs/feature-parity/index.md](feature-parity/index.md)

## Config Reference

See [src/config.ts](../src/config.ts) for all configuration options.

Key env vars:

- `FT_COOKIES_PATH` -- encrypted cookies file (for sync)
- `FT_PIPELINE_PASSWORD` -- decryption password
- `FT_CLIPPINGS_BASE` -- Clippings directory
- `FT_APP_ENV` -- environment (DEV/UAT/PROD, default: DEV)

Paths follow XDG Base Directory spec on Linux, OS-native conventions on macOS/Windows.

## Fix Specs

See `docs/_fixes/` for detailed fix specifications:

- `B1-merge-step-missing.md` -- DONE
- `B2-classify-wrong-columns.md` -- DONE
- `B3-classify-prompt-incomplete.md` -- DONE
- `B4-extract-article-images.md` -- OPEN (article images not captured)
- `B5-indexes-wrong-columns.md` -- DONE
- `B6-qwen-thinking-breaks-classify.md` -- DONE

## Project Files

| File                                                | Description                                   |
| --------------------------------------------------- | --------------------------------------------- |
| [`TODO.md`](../TODO.md)                             | Active TODO list                              |
| [`worktrees-immediate.md`](worktrees-immediate.md)  | Parallel worktree map + agent briefs (I0-I9)  |
| [`AGENTS.md`](../AGENTS.md)                         | Project structure, conventions, doc standards |
| [`src/config.ts`](../src/config.ts)                 | Paths, thresholds, taxonomy                   |
| [`src/main.ts`](../src/main.ts)                     | CLI entry point                               |
| [`src/utils/pipeline.ts`](../src/utils/pipeline.ts) | Pipeline orchestration                        |
| [`src/commands/`](../src/commands/)                 | Pipeline step implementations                 |
| [`src/utils/`](../src/utils/)                       | Shared utilities                              |
| [`src/llm/`](../src/llm/)                           | LLM client abstraction                        |
| [`src/extraction/`](../src/extraction/)             | Extraction source interface + GraphQL client  |

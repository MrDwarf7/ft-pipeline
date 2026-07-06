# ft-pipeline

Bookmark sync, extract, classify, generate pipeline for
[fieldtheory-cli](https://github.com/andrewfarah/fieldtheory).

## Setup

```bash
# One-time: create the pipeline DB schema
deno run --allow-all src/main.ts migrate

# Extract cookies (one-time, interactive)
deno run --allow-all src/main.ts cookies extract

# Or set password via env for headless use
export FT_PIPELINE_PASSWORD="your-password"
```

## Commands

```bash
# Full pipeline (migrate -> sync -> extract -> merge -> classify -> generate -> indexes)
deno run --allow-all src/main.ts full --password "$FT_PIPELINE_PASSWORD"

# Individual steps
deno run --allow-all src/main.ts sync --password "$FT_PIPELINE_PASSWORD"
deno run --allow-all src/main.ts extract --skip-existing
deno run --allow-all src/main.ts merge
deno run --allow-all src/main.ts classify
deno run --allow-all src/main.ts generate
deno run --allow-all src/main.ts indexes

# Dry runs
deno run --allow-all src/main.ts extract --dry-run --limit 10
deno run --allow-all src/main.ts classify --dry-run --limit 10
```

Or use deno tasks:

```bash
deno task start
deno task migrate
deno task sync
deno task extract
deno task merge
deno task classify
deno task generate
deno task indexes
deno task full
```

## Cron

```bash
# 3x daily sync (add to crontab or hermes cron)
0 10,16,2 * * * FT_PIPELINE_PASSWORD="$(cat ~/.config/ft-pipeline/.pw)" deno run --allow-all /path/to/src/main.ts full
```

### Automated LLM management

`scripts/run-with-llm.sh` wraps any CLI command with automatic LLM server lifecycle:

- Detects connection failures in command output (exits 0 even when LLM is down)
- Starts the LLM server if not running, waits for readiness, retries
- Cleans up only the server it started -- leaves pre-existing servers untouched

```bash
# Defaults: runs `ft-pipeline full`, starts `llama-me -r` on port 1234
./scripts/run-with-llm.sh

# Override for a different binary or command
PIPELINE="my-classifier" PIPELINE_CMD="run" ./scripts/run-with-llm.sh

# Custom LLM server
LLM_START_CMD="my-llm-server -p 8080" LLM_PROCESS="my-llm-server" LLM_PORT=8080 ./scripts/run-with-llm.sh
```

| Variable        | Default        | Description                              |
| --------------- | -------------- | ---------------------------------------- |
| `PIPELINE`      | `ft-pipeline`  | Binary/command to run                    |
| `PIPELINE_CMD`  | `full`         | Subcommand passed to the binary          |
| `LLM_PROCESS`   | `llama-server` | Process name for `pgrep -x` detection    |
| `LLM_START_CMD` | `llama-me -r`  | Command to start the LLM server          |
| `LLM_PORT`      | `1234`         | Port for readiness check (`/v1/models`)  |
| `LLM_TIMEOUT`   | `60`           | Max seconds to wait for server readiness |

## Architecture

```
src/main.ts             Entry point, command dispatch
src/types.ts            Command enum, Args interface, parse helpers
src/cli-schema.ts       Single source of truth for CLI commands and options
src/config.ts           All paths, settings, taxonomy
src/utils/pipeline.ts   Pipeline composition and full run orchestration
src/commands/
  migrate.ts            Create/migrate pipeline DB schema
  cookies.ts            Cookie extraction/decryption
  sync.ts               Native GraphQL sync from X -> pipeline.db
  extract.ts            xtracticle API -> clippings + DB linking
  merge.ts              Clippings enriched text -> DB
  classify.ts           LLM classification orchestrator
  generate.ts           Template-based .md generation from pipeline.db
  indexes.ts            Category/domain/entity index pages
  help.ts               Help text and usage output
src/llm/
  index.ts              LLM provider interface + factory
  openai-compat.ts      OpenAI-compatible API client (llama-server)
src/extraction/
  index.ts              Extraction source interface + factory
  graphql.ts            X GraphQL client (native, no ft-cli)
  schema.ts             Zod schemas for response validation
  types.ts              Shared types for extraction sources
src/utils/
  bases.ts              App environment + XDG path resolution
  db.ts                 Pipeline DB singleton
  crypto.ts             AES-GCM encryption for cookie file
  frontmatter.ts        Shared frontmatter parser
  hash.ts               SHA-256 hashing for content comparison
  logger.ts             Structured JSON logger
  env.ts                Env var checker + .env loader
  pipeline.ts           Pipeline orchestration
```

## Dependencies

- Deno 2.x
- sqlite3 CLI (system package)
- llama-server running locally at :1234 with a local model
- xtracticle.com API access
- X session cookies (for sync)

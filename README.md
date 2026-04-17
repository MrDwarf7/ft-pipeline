# ft-pipeline

Bookmark sync, extract, classify, generate pipeline for
[fieldtheory-cli](https://github.com/andrewfarah/fieldtheory).

## Setup

```bash
# Extract cookies (one-time, interactive)
deno run --allow-all main.ts cookies extract

# Or set password via env for headless use
export FT_PIPELINE_PASSWORD="your-password"
```

## Commands

```bash
# Full pipeline (sync → extract → classify → generate → indexes)
deno run --allow-all main.ts full --password "$FT_PIPELINE_PASSWORD"

# Individual steps
deno run --allow-all main.ts sync --password "$FT_PIPELINE_PASSWORD"
deno run --allow-all main.ts extract --skip-existing
deno run --allow-all main.ts classify
deno run --allow-all main.ts generate
deno run --allow-all main.ts indexes

# Dry runs
deno run --allow-all main.ts extract --dry-run --limit 10
deno run --allow-all main.ts classify --dry-run --limit 10
```

## Cron

```bash
# 3x daily sync (add to crontab or hermes cron)
0 10,16,2 * * * FT_PIPELINE_PASSWORD="$(cat ~/.ft-bookmarks/.pw)" deno run --allow-all /path/to/main.ts full
```

### Automated LLM management

`scripts/run-with-llm.sh` wraps any CLI command with automatic LLM server lifecycle:

- Detects connection failures in command output (exits 0 even when LLM is down)
- Starts the LLM server if not running, waits for readiness, retries
- Cleans up only the server it started — leaves pre-existing servers untouched

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
main.ts             Entry point, command dispatch
types.ts            Command enum, Args interface, parse helpers
help.ts             Help text and usage output
pipeline.ts         Pipeline composition and full run orchestration
config.ts           All paths, settings, taxonomy
commands/
  cookies.ts        Cookie extraction/decryption
  sync.ts           Wraps ft sync with cookie auth
  extract.ts        xtracticle API → clippings + DB linking
  classify.ts       LLM classification via local Gemma
  generate.ts       Wraps ft md --force
  indexes.ts        Generate category/domain index notes
utils/
  crypto.ts         AES-GCM encryption for cookie file
  frontmatter.ts    Shared frontmatter parser
```

## Dependencies

- Deno 2.x
- fieldtheory-cli (`pnpm start` in sibling directory)
- LM Studio running locally at :1234 with Gemma 4
- xtracticle.com API access

# ft-pipeline

Turn X (Twitter) bookmarks into a local archive: plain-text Clippings, a SQLite database, and
Obsidian-style markdown pages grouped by type and topic.

You do not need to write TypeScript to use it. Install Deno, have `sqlite3` on your PATH, save
cookies once for sync, and run a local LLM only if you want auto-classification.

## What it does

1. **Sync** -- bookmarks from X into a local DB  
2. **Extract** -- full text / articles into Clippings folders  
3. **Merge** -- enriched clipping text back into the DB  
4. **Classify** -- type + domain labels via a local LLM (skip if you do not care)  
5. **Generate** -- one markdown page per bookmark in your vault  
6. **Indexes** -- category / domain / entity pages (skip rewrite when unchanged)

`full` runs that sequence. You can also run steps alone (e.g. only `sync` + `generate`).

## Requirements

| Need | For |
| ---- | --- |
| [Deno](https://deno.land/) 2.x | Running the CLI |
| `sqlite3` CLI | Database |
| X session cookies | `sync` / `full` |
| Local OpenAI-compatible LLM on port 1234 | `classify` / full runs that include classify |
| Network to xtracticle.com | `extract` |

Data defaults under `~/.config/ft-pipeline/` (DB, logs, cookies, config). Vault paths come from
config (Clippings + wiki markdown).

## Quick start

```bash
git clone <this-repo> && cd ft-pipeline

deno run --allow-all src/main.ts migrate
deno run --allow-all src/main.ts cookies extract   # one-time, interactive

export FT_COOKIES_PATH="$HOME/.config/ft-pipeline/.sync-cookies.enc"
export FT_PIPELINE_PASSWORD="your-password"

deno run --allow-all src/main.ts config init       # optional editable config
deno run --allow-all src/main.ts full --password "$FT_PIPELINE_PASSWORD"
```

Compile if you want a single binary (handy for cron):

```bash
deno task build
./dist/ft-pipeline migrate
./dist/ft-pipeline full --password "$FT_PIPELINE_PASSWORD"
```

## Commands

```bash
deno run --allow-all src/main.ts <command> [options]
# or
./dist/ft-pipeline <command> [options]
```

| Command | Result |
| ------- | ------ |
| `migrate` | Create or update the DB schema |
| `cookies extract` / `check` | Encrypt cookies / verify the file |
| `sync` | Pull bookmarks from X |
| `extract` | Fill Clippings from xtracticle |
| `merge` | Clipping text into the DB |
| `classify` | LLM labels |
| `generate` | Bookmark markdown pages |
| `indexes` | Category / domain / entity indexes |
| `config` | `show`, `file`, `init`, `set`, `migrate` |
| `full` | Whole pipeline in order |

```bash
# Common flags
./dist/ft-pipeline extract --skip-existing
./dist/ft-pipeline extract --dry-run --limit 10
./dist/ft-pipeline classify --dry-run --limit 10
./dist/ft-pipeline sync --password "$FT_PIPELINE_PASSWORD"
./dist/ft-pipeline --help
./dist/ft-pipeline config --help
```

## Config

File: `~/.config/ft-pipeline/config.jsonc`

```bash
./dist/ft-pipeline config init
./dist/ft-pipeline config show
./dist/ft-pipeline config file
./dist/ft-pipeline config set maxExternalCallAttempts 4
./dist/ft-pipeline config migrate      # rewrite old key names on disk
./dist/ft-pipeline config --migrate    # same
```

Highest wins: `FT_*` env vars, then the config file, then built-ins.

`maxExternalCallAttempts` (default 4) is the shared HTTP retry budget for X, xtracticle, and the
LLM. Older files that still use `maxRetries` still load. On an interactive run you may be asked to
migrate; cron never blocks on that prompt (`FT_NO_CONFIG_MIGRATE_PROMPT=1` disables it).

## Environment

| Variable | When | Purpose |
| -------- | ---- | ------- |
| `FT_COOKIES_PATH` | sync / full | Encrypted cookies path |
| `FT_PIPELINE_PASSWORD` | sync / full | Cookie password (or `--password`) |
| `FT_PIPELINE_DB_PATH` | optional | DB path override |
| `FT_MARKDOWN_DIR` | optional | Wiki output root |
| `FT_CLIPPINGS_BASE` | optional | Clippings root |
| `FT_NO_HOUSEKEEPING` | optional | Skip log cleanup |
| `FT_NO_CONFIG_MIGRATE_PROMPT` | optional | Never ask to rewrite legacy config keys |

A `.env` under the config directory is loaded automatically when present.

## Cron and the LLM script

### Plain cron

```bash
0 10,16,2 * * * \
  FT_COOKIES_PATH="$HOME/.config/ft-pipeline/.sync-cookies.enc" \
  FT_PIPELINE_PASSWORD="$(cat "$HOME/.config/ft-pipeline/.pw")" \
  /path/to/ft-pipeline/dist/ft-pipeline full
```

`full` logs soft step failures (e.g. classify when the model is down) and continues. Hard failures
(missing password, no DB access) still stop that step.

### `scripts/run-with-llm.sh` (recommended for unattended classify)

For crons (or agents) that should not babysit the model server:

1. Detect "LLM connection refused" style failures  
2. Start the server if it is not already up  
3. Wait until `http://localhost:$LLM_PORT/v1/models` answers  
4. Retry the pipeline command  
5. Kill only a server **this script** started  

```bash
chmod +x scripts/run-with-llm.sh

# Default: PIPELINE=ft-pipeline, PIPELINE_CMD=full, LLM via llama-me -r on :1234
./scripts/run-with-llm.sh

# Point at your binary and keep your own start command
PIPELINE="/path/to/dist/ft-pipeline" \
PIPELINE_CMD="full" \
LLM_START_CMD="llama-me -r" \
LLM_PROCESS="llama-server" \
LLM_PORT=1234 \
./scripts/run-with-llm.sh
```

| Variable | Default | Meaning |
| -------- | ------- | ------- |
| `PIPELINE` | `ft-pipeline` | CLI binary (must be on `PATH` or absolute) |
| `PIPELINE_CMD` | `full` | Subcommand |
| `LLM_PROCESS` | `llama-server` | Exact name for `pgrep -x` |
| `LLM_START_CMD` | `llama-me -r` | How to start the server |
| `LLM_PORT` | `1234` | Readiness port |
| `LLM_TIMEOUT` | `60` | Seconds to wait for readiness |

Put the script (or a wrapper that exports env) on crontab the same way you would call the binary.

## For agents (Cursor / Grok / Claude / etc.)

This repo ships a project skill at:

```
.grok/skills/ft-pipeline/SKILL.md
```

Point your agent at that skill (or open the repo so Grok picks it up). It covers binary vs
`deno run`, cron + `run-with-llm.sh`, config migrate, and the usual footguns. Humans can ignore it
and stay on this README.

Longer conventions for contributors/agents: [AGENTS.md](./AGENTS.md).

## Tests (developers)

```bash
deno task test:unit
deno task test:e2e
deno task ch:all
```

## Layout (short)

```
src/main.ts              CLI entry
src/config.ts            Paths, taxonomy, retries
src/commands/            Pipeline steps + config
src/extraction/          X GraphQL + xtracticle
src/llm/                 Local OpenAI-compatible client
src/utils/               db, http retry, logging, …
scripts/run-with-llm.sh  Cron-friendly LLM lifecycle wrapper
.grok/skills/ft-pipeline Agent skill pack
```

## Inspiration

Originally sparked by ideas around [fieldtheory](https://github.com/andrewfarah/fieldtheory). This
project is a separate pipeline and database; you do not need that CLI installed.

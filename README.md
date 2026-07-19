# ft-pipeline

Turn your X (Twitter) bookmarks into a local archive: plain text clippings, a SQLite
database, and Obsidian-friendly markdown pages sorted by type and topic.

You do not need to know GraphQL or TypeScript to use it. You need Deno, `sqlite3` on your
PATH, your X cookies (for sync), and a local LLM only if you want automatic classification.

## What it does

Roughly in order:

1. **Sync** -- pull bookmarks from X into a local DB
2. **Extract** -- fetch full text / articles via [xtracticle](https://xtracticle.com) into Clippings
3. **Merge** -- fold enriched clipping text back into the DB
4. **Classify** -- label type + domain with a local LLM (optional if you skip this step)
5. **Generate** -- write one markdown stub per bookmark into your vault
6. **Indexes** -- category / domain / entity index pages (only rewrite when content changes)

`full` runs that whole sequence. Individual steps still work if you only want sync + generate.

## Requirements

| Need | Why |
| ---- | --- |
| [Deno](https://deno.land/) 2.x | Runs the CLI |
| `sqlite3` CLI | Database (system package, not a Node driver) |
| X session cookies | Sync only |
| Local LLM at `localhost:1234` (OpenAI-compatible) | Classify only |
| Network to xtracticle.com | Extract only |

Outputs default under XDG config (`~/.config/ft-pipeline/` for DB/logs/cookies) and your
vault paths from config (Clippings + wiki markdown).

## Quick start

```bash
# Install deps if needed (Arch example)
# pacman -S deno sqlite

git clone <this-repo> && cd ft-pipeline

# Schema (safe to re-run)
deno run --allow-all src/main.ts migrate

# One-time: capture encrypted cookies from a logged-in browser session
deno run --allow-all src/main.ts cookies extract

# Env for headless / cron (paths are yours)
export FT_COOKIES_PATH="$HOME/.config/ft-pipeline/.sync-cookies.enc"
export FT_PIPELINE_PASSWORD="your-password"

# Optional: create a config file you can edit later
deno run --allow-all src/main.ts config init
deno run --allow-all src/main.ts config show

# Whole pipeline (needs cookies password + LLM for classify)
deno run --allow-all src/main.ts full --password "$FT_PIPELINE_PASSWORD"
```

Or compile once and use a binary:

```bash
deno task build
./dist/ft-pipeline migrate
./dist/ft-pipeline full --password "$FT_PIPELINE_PASSWORD"
```

## Commands

```bash
deno run --allow-all src/main.ts <command> [options]
# after build:
./dist/ft-pipeline <command> [options]
```

| Command | What you get |
| ------- | ------------ |
| `migrate` | Create/update the pipeline DB |
| `cookies extract` / `cookies check` | Store or verify encrypted X cookies |
| `sync` | Fetch new bookmarks from X |
| `extract` | Pull full content into Clippings folders |
| `merge` | Copy clipping text into the DB |
| `classify` | LLM labels (type + domain) |
| `generate` | Per-bookmark markdown pages |
| `indexes` | Category / domain / entity indexes |
| `config` (`show`, `file`, `init`, `set`, `migrate`) | Inspect or edit `config.jsonc` |
| `full` | Run migrate through indexes in order |

Useful flags (see `--help` for the full list):

```bash
# Skip re-downloading clippings you already have
deno run --allow-all src/main.ts extract --skip-existing

# Peek without writing
deno run --allow-all src/main.ts extract --dry-run --limit 10
deno run --allow-all src/main.ts classify --dry-run --limit 10

# Password for sync/full (or FT_PIPELINE_PASSWORD)
deno run --allow-all src/main.ts sync --password "$FT_PIPELINE_PASSWORD"
```

`deno task start -- <command>` also works if you prefer tasks (`start` is just a thin runner).

## Config

Default file: `~/.config/ft-pipeline/config.jsonc` (override with `-C` / `--config` when supported).

```bash
deno run --allow-all src/main.ts config init     # write defaults
deno run --allow-all src/main.ts config show     # effective values
deno run --allow-all src/main.ts config file     # print path
deno run --allow-all src/main.ts config set maxExternalCallAttempts 4
deno run --allow-all src/main.ts config migrate  # rewrite old key names on disk
# same as migrate:
deno run --allow-all src/main.ts config --migrate
```

Resolution order (highest wins):

1. `FT_*` environment variables (paths, password, etc.)
2. The config file
3. Built-in defaults

Retry budget for X / xtracticle / the LLM is `maxExternalCallAttempts` (default 4). Older files
that still say `maxRetries` still load; on a normal interactive run you may be asked to migrate
the key, or you can run `config migrate` yourself. Non-interactive runs never block on that prompt.

## Environment

| Variable | When | Purpose |
| -------- | ---- | ------- |
| `FT_COOKIES_PATH` | sync / full | Encrypted cookies file |
| `FT_PIPELINE_PASSWORD` | sync / full | Decrypt cookies (or `--password`) |
| `FT_PIPELINE_DB_PATH` | optional | Override DB path |
| `FT_MARKDOWN_DIR` | optional | Wiki output root |
| `FT_CLIPPINGS_BASE` | optional | Clippings root |
| `FT_NO_HOUSEKEEPING` | optional | Skip log rotation cleanup |
| `FT_NO_CONFIG_MIGRATE_PROMPT` | optional | Never prompt to rewrite legacy config keys |

You can put secrets in `~/.config/ft-pipeline/.env` (loaded automatically) or export them in the
shell.

## Cron / unattended

```bash
# Example: a few times a day. Password from a file only you can read.
0 10,16,2 * * * FT_COOKIES_PATH="$HOME/.config/ft-pipeline/.sync-cookies.enc" \
  FT_PIPELINE_PASSWORD="$(cat "$HOME/.config/ft-pipeline/.pw")" \
  /usr/bin/deno run --allow-all /path/to/ft-pipeline/src/main.ts full
```

`full` keeps going past soft step failures (e.g. classify if the model is down) and logs what
failed. Hard errors (missing DB path permissions, bad password, etc.) still stop that step.

### Optional: auto-start the LLM

`scripts/run-with-llm.sh` starts a local LLM server if needed, runs a command, then stops only
the server it started:

```bash
./scripts/run-with-llm.sh
# PIPELINE=ft-pipeline PIPELINE_CMD=full by default
```

| Variable | Default | Meaning |
| -------- | ------- | ------- |
| `PIPELINE` | `ft-pipeline` | Binary to run |
| `PIPELINE_CMD` | `full` | Subcommand |
| `LLM_PROCESS` | `llama-server` | Name for process check |
| `LLM_START_CMD` | `llama-me -r` | How to start the server |
| `LLM_PORT` | `1234` | Readiness check port |
| `LLM_TIMEOUT` | `60` | Seconds to wait for `/v1/models` |

## Layout (for the curious)

```
src/main.ts                 CLI entry
src/config.ts               Paths, taxonomy, maxExternalCallAttempts
src/cli-schema.tree.ts      Commands / help tree
src/cli-schema.types.ts     Schema types
src/commands/               migrate, sync, extract, merge, classify, generate, indexes, config
src/extraction/             X GraphQL + xtracticle client
src/llm/                    OpenAI-compatible local model client
src/utils/db.ts             sqlite3 CLI helpers (insert/upsert/update/select)
src/utils/http.ts           Shared fetch + 429 retry
```

Agent-oriented detail lives in [AGENTS.md](./AGENTS.md). Open design notes: [docs/](./docs/).

## Tests

```bash
deno task test:unit          # unit + integration
deno task test:e2e           # CLI smoke (temp DB, help, config)
deno task ch:all             # fmt + typecheck + lint
```

## License / upstream

Built for personal bookmark workflows around
[fieldtheory-cli](https://github.com/andrewfarah/fieldtheory). This repo is its own pipeline and
database; it does not shell out to `ft` for day-to-day runs.

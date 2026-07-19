# ft-pipeline

Turn X (Twitter) bookmarks into a local archive: Clippings text, a SQLite DB, and Obsidian-style
markdown pages by type and topic.

You do not need to write TypeScript. Install Deno, save cookies once for sync, and run a local LLM
only if you want auto-classification.

## Contents

- [Agents and LLMs start here](#agents-and-llms-start-here) -- paste this repo at an agent
- [For everyone](#for-everyone) -- what it does, what you need, first run
- [CLI and technical](#cli-and-technical) -- commands, flags, config, env, cron, tests

---

## Agents and LLMs start here

```
╔══════════════════════════════════════════════════════════╗
║  AGENTS AND LLMs START HERE                              ║
║  Human said "make it work" with this repo? Read below.   ║
╚══════════════════════════════════════════════════════════╝
```

If someone sent you this README (or the repo link) and wants the pipeline running:

1. Load the project skill (same file, several paths):
   - `.agents/.master/skills/ft-pipeline/SKILL.md` (canonical)
   - or `.agents/skills/ft-pipeline/`, `.grok/skills/ft-pipeline/`, `.claude/skills/ft-pipeline/`
2. Follow that skill for install, env, cookies, `full`, and cron + LLM.
3. Editing code? Also read [AGENTS.md](./AGENTS.md) before changing TypeScript.
4. Packaging layout for multi-agent skills: [`.agents/README.md`](./.agents/README.md).

Minimal "get them unblocked" path once Deno is installed:

```bash
deno task start migrate
deno task start cookies extract   # interactive, once
export FT_COOKIES_PATH="$HOME/.config/ft-pipeline/.sync-cookies.enc"
export FT_PIPELINE_PASSWORD="..."                  # ask the human
deno task start full --password "$FT_PIPELINE_PASSWORD"
```

Prefer `./dist/ft-pipeline` after `deno task build` for cron. Release builds use least-privilege
flags (not `--allow-all`). Soft failures inside `full` (e.g. classify with no LLM) are logged;
remaining steps still run.

Humans who are not using an agent: skip this section and keep reading.

---

## For everyone

### What you get

Bookmarks leave the X app and land on your machine as:

1. Rows in a local database
2. Plain markdown Clippings (articles / posts / media)
3. Wiki-style pages you can open in Obsidian (or any markdown vault)

Optional: a local model tags each bookmark with a type (tool, tutorial, …) and a domain (ai-ml,
security, …). Skip classify if you only want text and files.

### The pipeline in plain English

| Step     | What happens                                                          |
| -------- | --------------------------------------------------------------------- |
| Sync     | Pull bookmarks from X into SQLite                                     |
| Extract  | Fetch full text via xtracticle into Clippings folders                 |
| Merge    | Put the best clipping text back on each DB row                        |
| Classify | Local LLM assigns type + domain (optional)                            |
| Generate | One markdown page per bookmark under your wiki root                   |
| Indexes  | Category / domain / entity index pages (skips rewrite when unchanged) |

`full` runs that sequence. You can also run one step at a time.

### What you need

| Need                                     | Why                                            |
| ---------------------------------------- | ---------------------------------------------- |
| [Deno](https://deno.land/) 2.x           | Runs the CLI (or use a prebuilt binary)        |
| X session cookies                        | Only for sync / full                           |
| Local OpenAI-compatible LLM on port 1234 | Only for classify (or full when classify runs) |
| Network to xtracticle.com                | Extract                                        |

No host `sqlite3` CLI. The DB uses Deno's built-in `node:sqlite` and ships inside `deno compile`
binaries.

Defaults live under `~/.config/ft-pipeline/` (DB, logs, encrypted cookies, config). Vault paths
(Clippings + wiki) come from config; stock defaults point at `~/StoneVault/…` if you use that
layout.

### First run (copy-paste)

```bash
git clone <this-repo> && cd ft-pipeline

# schema (tasks use least-privilege flags, not --allow-all)
deno task start migrate

# one-time: encrypt browser cookies for X
deno task start cookies extract

export FT_COOKIES_PATH="$HOME/.config/ft-pipeline/.sync-cookies.enc"
export FT_PIPELINE_PASSWORD="your-password"

# optional: write an editable config file
deno task start config init

# whole pipeline
deno task start full --password "$FT_PIPELINE_PASSWORD"
```

Prefer a binary (cron-friendly; DB is embedded):

```bash
deno task build
./dist/ft-pipeline migrate
./dist/ft-pipeline full --password "$FT_PIPELINE_PASSWORD"
```

Cross-compile (also used by CI release matrix):

```bash
deno task build:linux      # x86_64-unknown-linux-gnu
deno task build:windows    # x86_64-pc-windows-msvc
deno task build:macos-arm  # aarch64-apple-darwin
deno task build:macos-x64  # x86_64-apple-darwin
```

### Day-to-day

After setup you mostly care about:

```bash
# catch up bookmarks + refresh wiki
./dist/ft-pipeline full --password "$FT_PIPELINE_PASSWORD"

# or pieces
./dist/ft-pipeline sync --password "$FT_PIPELINE_PASSWORD"
./dist/ft-pipeline extract --skip-existing
./dist/ft-pipeline generate
./dist/ft-pipeline indexes
```

If classify fails because the model is down, `full` logs it and keeps going on the rest of the
steps. Missing password or a dead DB still fail hard on that step.

### Unattended runs

Put the binary on cron with `FT_COOKIES_PATH` and `FT_PIPELINE_PASSWORD` set. For classify that
should start the LLM when needed, use [`scripts/run-with-llm.sh`](./scripts/run-with-llm.sh)
(details under [CLI and technical](#cron-and-the-llm-script)).

### Agent skill

See [Agents and LLMs start here](#agents-and-llms-start-here) for the banner, skill paths, and "make
it work" checklist. Packaging: [`.agents/README.md`](./.agents/README.md).

---

## CLI and technical

### Invocation

```bash
deno task start <command> [options]
# or
./dist/ft-pipeline <command> [options]
```

`deno task start` is least-privilege `deno run` (read/write/env/sys=homedir/net). Tests still use
`--allow-all`.

### Commands

| Command           | Result                                                                 |
| ----------------- | ---------------------------------------------------------------------- |
| `migrate`         | Create / update DB schema (run once, safe to re-run)                   |
| `cookies extract` | Interactive encrypt of X cookies                                       |
| `cookies check`   | Verify the encrypted file exists / loads                               |
| `sync`            | GraphQL pull from X into `pipeline.db`                                 |
| `extract`         | xtracticle -> Clippings + DB extract fields                            |
| `merge`           | Clipping body -> `clippings_text` on matching rows                     |
| `classify`        | Local LLM type + domain labels                                         |
| `generate`        | Bookmark markdown pages                                                |
| `indexes`         | Category / domain / entity indexes                                     |
| `config`          | `show`, `file`, `init`, `set`, `migrate`                               |
| `full`            | migrate -> sync -> extract -> merge -> classify -> generate -> indexes |

`full` is implemented and used in practice; it may not appear on `--help` until the schema lists it.
Prefer the binary or `deno run … full` the same way as other commands.

### Useful flags

```bash
./dist/ft-pipeline --help
./dist/ft-pipeline config --help

./dist/ft-pipeline extract --skip-existing
./dist/ft-pipeline extract --dry-run --limit 10
./dist/ft-pipeline classify --dry-run --limit 10
./dist/ft-pipeline sync --password "$FT_PIPELINE_PASSWORD"
./dist/ft-pipeline -v full --password "$FT_PIPELINE_PASSWORD"
```

Global options (from root help) include `--cookies`, `--force`, `--config`, `--verbose` / `--quiet`,
`--log`, `--format`, `--limit`.

### Config

File: `~/.config/ft-pipeline/config.jsonc`

```bash
./dist/ft-pipeline config init
./dist/ft-pipeline config show
./dist/ft-pipeline config file
./dist/ft-pipeline config set maxExternalCallAttempts 4
./dist/ft-pipeline config migrate      # rewrite old key names on disk
./dist/ft-pipeline config --migrate    # same
```

Resolution order (highest wins):

1. `FT_*` environment variables
2. Config file
3. Built-in defaults (XDG paths + vault defaults)

`maxExternalCallAttempts` (default 4) is the shared HTTP attempt budget for X, xtracticle, and the
LLM (total tries, not "retries after first"). Older files that still say `maxRetries` still load.
Interactive runs may prompt to rewrite the file; cron never blocks on that
(`FT_NO_CONFIG_MIGRATE_PROMPT=1` turns the prompt off).

### Environment

| Variable                      | When        | Purpose                           |
| ----------------------------- | ----------- | --------------------------------- |
| `FT_COOKIES_PATH`             | sync / full | Encrypted cookies path            |
| `FT_PIPELINE_PASSWORD`        | sync / full | Cookie password (or `--password`) |
| `FT_PIPELINE_DB_PATH`         | optional    | DB path override                  |
| `FT_MARKDOWN_DIR`             | optional    | Wiki output root                  |
| `FT_CLIPPINGS_BASE`           | optional    | Clippings root                    |
| `FT_NO_HOUSEKEEPING`          | optional    | Skip log rotation cleanup         |
| `FT_NO_CONFIG_MIGRATE_PROMPT` | optional    | Never ask to rewrite legacy keys  |

A `.env` under the config directory is loaded when present.

### Cron and the LLM script

#### Plain cron

```bash
0 10,16,2 * * * \
  FT_COOKIES_PATH="$HOME/.config/ft-pipeline/.sync-cookies.enc" \
  FT_PIPELINE_PASSWORD="$(cat "$HOME/.config/ft-pipeline/.pw")" \
  /path/to/ft-pipeline/dist/ft-pipeline full
```

#### `scripts/run-with-llm.sh`

For unattended classify when the model server might be off:

1. Run the pipeline command
2. If it looks like "LLM connection refused", start the server
3. Wait until `http://localhost:$LLM_PORT/v1/models` answers
4. Retry the command
5. Kill only a server **this script** started

```bash
chmod +x scripts/run-with-llm.sh

# Defaults: PIPELINE=ft-pipeline, PIPELINE_CMD=full, LLM via llama-me -r on :1234
./scripts/run-with-llm.sh

PIPELINE="/path/to/dist/ft-pipeline" \
PIPELINE_CMD="full" \
LLM_START_CMD="llama-me -r" \
LLM_PROCESS="llama-server" \
LLM_PORT=1234 \
./scripts/run-with-llm.sh
```

| Variable        | Default        | Meaning                           |
| --------------- | -------------- | --------------------------------- |
| `PIPELINE`      | `ft-pipeline`  | Binary on `PATH` or absolute path |
| `PIPELINE_CMD`  | `full`         | Subcommand                        |
| `LLM_PROCESS`   | `llama-server` | Exact name for `pgrep -x`         |
| `LLM_START_CMD` | `llama-me -r`  | How to start the server           |
| `LLM_PORT`      | `1234`         | Readiness port                    |
| `LLM_TIMEOUT`   | `60`           | Seconds to wait for readiness     |

### Deno tasks (dev)

```bash
deno task start          # CLI entry (least-privilege)
deno task build          # compile host binary -> dist/ft-pipeline
deno task build:linux    # also: build:windows, build:macos-arm, build:macos-x64
deno task test:unit
deno task test:e2e
deno task ch:all         # fmt + check + lint (required after code changes)
```

There is no `deno task migrate` / `deno task sync` shortcut for production commands. Use the binary
or `deno task start <command>`.

### Layout

```
src/main.ts                 CLI entry + dispatch
src/config.ts               Paths, taxonomy, retries, config file
src/cli-schema.tree.ts      Command/option tree (help + parse)
src/commands/               Pipeline steps + config + cookies
src/extraction/             X GraphQL + xtracticle
src/llm/                    OpenAI-compatible local client
src/utils/                  db, pipeline, http retry, logging, …
scripts/run-with-llm.sh     Cron-friendly LLM lifecycle wrapper
.agents/.master/skills/     Canonical agent skill pack
.agents/{grok,claude,...}/  Symlinks to master (tool packaging)
.claude, .grok              Root shims -> .agents/{claude,grok}
```

### Inspiration

Originally sparked by ideas around [fieldtheory](https://github.com/andrewfarah/fieldtheory). This
project is a separate pipeline and database; you do not need that CLI installed.

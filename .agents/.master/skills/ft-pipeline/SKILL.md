---
name: ft-pipeline
description: >
  Run and troubleshoot the ft-pipeline bookmark CLI (sync, extract, merge, classify,
  generate, indexes, full). Use when the user mentions bookmarks, pipeline, Clippings,
  wiki indexes, ft-pipeline, cron with LLM, cookies encrypt, or config migrate.
  Triggers: /ft-pipeline, "run the pipeline", "sync bookmarks", "classify bookmarks".
---

# ft-pipeline (agent skill)

Local Deno CLI: X bookmarks -> SQLite + Clippings + Obsidian wiki pages.

**Repo (this machine):** absolute path of the clone you are in. Prefer `pwd` / project root. Do not
invent `~/...` paths that resolve into a sandbox home unless the user said so.

## Prefer the compiled binary when present

```bash
# From repo root
test -x ./dist/ft-pipeline && BIN=./dist/ft-pipeline || BIN="deno run --allow-all src/main.ts"
$BIN --help
$BIN migrate
$BIN config show
```

Build if missing: `deno task build` -> `./dist/ft-pipeline`.

There is **no** `deno task full` / `deno task sync`. Use `$BIN <command>` or
`deno task start -- <command>`.

## Safe first-time path (humans / agents)

1. `migrate` -- create/update DB (always safe to re-run)
2. `cookies extract` -- interactive once; needs a browser session with X logged in
3. Set env (or project/config `.env` under XDG config):

```bash
export FT_COOKIES_PATH="$HOME/.config/ft-pipeline/.sync-cookies.enc"
export FT_PIPELINE_PASSWORD="..."   # or --password on sync/full
```

4. Optional: `config init` then `config show`
5. `full --password "$FT_PIPELINE_PASSWORD"` or step-by-step

## Commands (what each one is for)

| Command                             | Needs                              | Does                                               |
| ----------------------------------- | ---------------------------------- | -------------------------------------------------- |
| `migrate`                           | disk                               | Schema only                                        |
| `cookies extract/check`             | interactive / file                 | Encrypted cookie store                             |
| `sync`                              | cookies + password                 | X GraphQL -> pipeline.db                           |
| `extract`                           | network (xtracticle)               | Thread text -> Clippings + DB paths                |
| `merge`                             | Clippings on disk                  | Enriched text into DB                              |
| `classify`                          | LLM at localhost:1234              | type + domain labels                               |
| `generate`                          | DB                                 | Bookmark markdown under wiki                       |
| `indexes`                           | DB                                 | Category/domain/entity pages (hash-skip unchanged) |
| `config show/file/init/set/migrate` | --                                 | Inspect / edit / rewrite legacy keys               |
| `full`                              | cookies for sync; LLM for classify | Entire sequence                                    |

Soft step failures inside `full` are logged; remaining steps still run. Hard errors (bad password,
no FS access) fail that step.

## Cron + LLM babysitting

Use repo script `scripts/run-with-llm.sh`:

```bash
# Defaults: runs `ft-pipeline full`, starts `llama-me -r` if needed, port 1234
./scripts/run-with-llm.sh

# Or point at the compiled binary on PATH / absolute path
PIPELINE="/abs/path/to/dist/ft-pipeline" PIPELINE_CMD="full" ./scripts/run-with-llm.sh
```

| Env             | Default        | Meaning                       |
| --------------- | -------------- | ----------------------------- |
| `PIPELINE`      | `ft-pipeline`  | Binary                        |
| `PIPELINE_CMD`  | `full`         | Subcommand                    |
| `LLM_PROCESS`   | `llama-server` | `pgrep -x` name               |
| `LLM_START_CMD` | `llama-me -r`  | Start server                  |
| `LLM_PORT`      | `1234`         | Ready when `/v1/models` works |
| `LLM_TIMEOUT`   | `60`           | Seconds to wait               |

The script only kills an LLM **it** started. Pre-existing servers stay up.

Bare cron without the wrapper (password from a root-only file):

```bash
0 10,16,2 * * * FT_COOKIES_PATH=... FT_PIPELINE_PASSWORD="$(cat .../.pw)" \
  /usr/bin/deno run --allow-all /abs/path/src/main.ts full
```

## Config notes agents forget

- File: `~/.config/ft-pipeline/config.jsonc` (`config file` prints the path)
- Retry budget: `maxExternalCallAttempts` (default 4). Old `maxRetries` still loads; rewrite with
  `config migrate` or answer the interactive prompt on a TTY.
- Classify: LLM `check()` runs a short probe on purpose. If that fails, do not expect a classify
  batch. Per-item failures after check use `settleClassify` and continue.

## Do not

- Depend on or shell out to any external "ft" / fieldtheory bookmark CLI
- Use `deno task full` / `deno task sync` (those tasks are not defined)
- Invent default TypeScript params or silence lint when editing this repo

## Deeper docs

- Human install/usage: `README.md`
- Agent conventions / schema / taxonomy: `AGENTS.md`
- Open backlog: `TODO.md`

# Feature Parity -- What We're Porting

We're NOT doing 1:1 feature parity with fieldtheory-cli. We're grabbing the parts we need to **kill
the dependency on ft-cli entirely**.

## What We Don't Want (Skip These)

- OAuth API sync (we use GraphQL + cookies like ft-cli does)
- "Possibility runs" / ideas / adjacent frames (ft-cli specific)
- Companion app / Field Theory Library (out of scope)
- Agent skill install (we have our own Hermes/Codex setup)
- Interactive prompts / wizards (we want automated pipelines)
- FTS5 search (we have our own DB + classification system)
- Stats/viz dashboards (nice but not priority)

## What We DO Want (Port These)

| Feature                          | Why                                        | Status  |
| -------------------------------- | ------------------------------------------ | ------- |
| **Sync (GraphQL)**               | Kill ft-cli delegation, native Deno impl   | Done    |
| **Cookie extraction/decryption** | Needed for native sync                     | Done    |
| **Merge step**                   | Clippings -> DB enrichment                 | Done    |
| **Classify (LLM)**               | Local llama-server, type + domain          | Done    |
| **Generate (template-based)**    | Template closures, no ft-cli               | Done    |
| **Indexes**                      | Category/domain/entity pages               | Done    |
| **Bookmark folders**             | Sync + tag bookmarks from X                | Missing |
| **Media download**               | Configurable path, images + videos         | Missing |
| **LLM fallback chain**           | Primary local + ordered fallback providers | Missing |
| **Test Suite**                   | Deno test + vitest, critical path coverage | Missing |

## New Features (Not in ft-cli)

### LLM Fallback Chain

- Primary: local model at `localhost:1234`
- Fallback: ordered list of providers/models
- Config: `fallbackProviders` array, each entry `{ baseUrl, model, provider? }`
- On classify failure, try next provider before giving up
- Pattern: similar to hermes-agent's `fallback_providers`

## Explicit Requirements

### 1. Bookmark Folders

- Sync X bookmark folder tags (read-only mirror)
- Tag bookmarks with folder names
- List/filter by folder
- Show folder distribution

### 2. Media Download

- Configurable storage path via `FT_MEDIA_DIR` (media can get large)
- Per-asset size cap via `FT_MEDIA_MAX_BYTES` (default 200MB)
- Download: tweet media, article images, profile images (optional skip)
- Backfill missing media for existing bookmarks

### 3. Test Suite

- `Deno.test` (built-in) as baseline framework
- Evaluate vitest for advanced features (mocking, snapshots, coverage)
- Cover: sync pagination, classify/merge logic, generate templates, hash utils, config resolution
- Critical path first, edge cases second

# Features — In-Housing Plan

**Goal: Kill all `fieldtheory-cli` dependencies. Implement natively in ft-pipeline using the `llm/` interface pattern.**

## Feature List

| ID  | Feature | Priority | Description | Doc |
|-----|---------|----------|-------------|-----|
| **F0** | **Base GraphQL Port (Sync)** | **P0** | Port `graphql-bookmarks.ts` to native Deno `fetch()`. Replace `runFtCommand("start", "sync")`. Foundation for everything else. | [F0-base-graphql-port.md](./F0-base-graphql-port.md) |
| **F1** | **Generate (Template-Based)** | **P1** | Rewrite `generate.ts` using `src/llm/` + template closures. Kill `ft md --force` delegation. | [F1-generate.md](./F1-generate.md) |
| **F2** | **Unified Extraction** | **P2** | Replace xtracticle.com API with direct X API. Clone websites repo, unify extraction logic into `src/extraction/`. | [F2-unified-extraction.md](./F2-unified-extraction.md) |
| **F3** | **Bookmark Folders** | **P3** | Sync X bookmark folder tags, tag bookmarks. Wanted but not blocking. Port if easy during F0. | [F3-bookmark-folders.md](./F3-bookmark-folders.md) |
| **F4** | **Media Download** | **P4** | Download media to configurable path. Port `bookmark-media.ts`. | [F4-media-download.md](./F4-media-download.md) |

## Implementation Pattern (mimic `llm/`)

```
src/extraction/
├── index.ts          # Interfaces + exports (like llm/index.ts)
├── graphql.ts        # F0: GraphQL sync implementation
├── xtracticle.ts     # Keep as fallback? Remove after F2
├── websites.ts       # F2: Clone websites repo logic
├── shared.ts         # Pure functions (classifyTweet, extractMedia, etc.)
└── types.ts          # TweetData, MediaItem, ArticleData
```

Adding a new source = drop file implementing `TweetSource` interface. Same for LLM providers in `llm/`.

## Conventions (Your Style)

- **Shortname imports**: `import { Database } from "@db/sqlite"` (no full URLs)
- **Hard-code defaults**: Max 1-2 params per function
- **Builder pattern**: `buildUrl()`, `buildHeaders()` return self/value
- **No free-floating code**: All logic inside functions/classes
- **`config.ts` + `bases.ts`**: Central config, no reinventing env logic
- **`deno task ch:all`**: Run after EVERY file edit (not batches)
- **JJ**: Edit in worktree, atomic commits (code, docs, tests separate)

## Files to Delete (After F0 + F1 + F2)

- `src/utils/ft-cli.ts` — `runFtCommand()` helper (no longer needed)
- Remove `ftCliDir` from `config.ts` and `bases.ts`

## Priority Order

1. **F0 (Sync)** — native GraphQL client, kill `pnpm start sync` delegation
2. **F1 (Generate)** — template closures + `src/llm/`, kill `ft md --force`
3. **F2 (Extract)** — replace xtracticle with direct X API, unify logic
4. **F3 (Folders)** — folder sync (wanted, not blocking)
5. **F4 (Media)** — configurable media download

## Current Status (from `TODO.md`)

- ✅ Sync works but delegates to ft-cli
- ✅ Extract patched (query + classifyTweet)
- ⚠️ Generate delegates to ft-cli (`ft md --force`)
- ❌ Bookmark folders missing entirely
- ⚠️ Media download missing (configurable path needed)

## Reference Docs

- `docs/feature-parity/` — original analysis of what to port/skip
- `fieldtheory-cli/src/graphql-bookmarks.ts` — GraphQL sync logic (F0)
- `fieldtheory-cli/src/bookmark-enrich.ts` — article fetch (F2)
- `fieldtheory-cli/src/bookmark-media.ts` — media download (F4)
- `fieldtheory-cli/src/md.ts` — NOT porting (we write our own, see F1)
- `websites repo` — clone and unify extraction logic (F2)

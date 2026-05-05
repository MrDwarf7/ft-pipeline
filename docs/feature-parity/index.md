# Feature Parity — What We're Porting

We're NOT doing 1:1 feature parity with fieldtheory-cli. We're grabbing the parts we need to **kill
the dependency on ft-cli entirely**.

## What We Don't Want (Skip These)

- ❌ OAuth API sync (we use GraphQL + cookies like ft-cli does)
- ❌ "Possibility runs" / ideas / adjacent frames (ft-cli specific)
- ❌ Companion app / Field Theory Library (out of scope)
- ❌ Agent skill install (we have our own Hermes/Codex setup)
- ❌ Interactive prompts / wizards (we want automated pipelines)
- ❌ FTS5 search (we have our own DB + classification system)
- ❌ Stats/viz dashboards (nice but not priority)

## What We DO Want (Port These)

| Feature                          | Why                                                                    | Status                                    |
| -------------------------------- | ---------------------------------------------------------------------- | ----------------------------------------- |
| **Sync (GraphQL)**               | Currently delegates to ft-cli → want it native                         | ✅ works but delegates (need native impl) |
| **Cookie extraction/decryption** | Needed for native sync, currently uses ft-cli's logic                  | ✅ works via `cookies.ts`                 |
| **Bookmark folders**             | You explicitly want this — sync + tag bookmarks                        | ❌ Missing                                |
| **Media download**               | You explicitly want this — configurable path, can get large            | ⚠️ Partial (article images B4)            |
| **Unified extraction logic**     | Share between ft-cli's logic + Xtracticle API                          | ❌ Missing (shared package)               |
| **Classify (LLM)**               | OpenAI + Anthropic + one more, local llama-server                      | ⚠️ Works but writes wrong columns (B2/B3) |
| **Generate (template-based)**    | Replace inefficient ft-cli delegation with template strings + closures | ⚠️ Currently delegates to ft-cli          |
| ~~Merge step~~                   | **Not needed** — we won't rely on "someone else's shit"                | ❌ Skipped intentionally                  |

## Your Explicit Requirements

### 1. Native Sync (Kill ft-cli Dependency)

- GraphQL bookmark sync (what ft-cli does via `syncBookmarksGraphQL`)
- Cookie extraction from browsers (Chrome, Firefox, etc.)
- Folder sync (`--folders`, `--folder <name>`)
- Media download with configurable path

### 2. Bookmark Folders

- Sync X bookmark folder tags (read-only mirror)
- Tag bookmarks with folder names
- List/filter by folder
- Show folder distribution

### 3. Media Download

- Configurable storage path via CLI or `config.ts` (media can get large)
- Default: `~/.ft-bookmarks/media/`
- Download: tweet media, article images, profile images (optional skip)
- Per-asset size cap (default 200MB)
- Backfill missing media for existing bookmarks

### 4. Unified Extraction Package

- Share logic between:
  - ft-cli's extraction (GraphQL, article enrichment)
  - Xtracticle API (used in our `extract.ts`)
- Common interfaces, shared `classifyTweet`, media extraction
- Separate Deno/TypeScript module (or `utils/extraction/`)

### 5. Classify (Simple LLM Support)

- **Only 3 endpoints**: OpenAI API, Anthropic API, + one more (Ollama? LM Studio?)
- Local LLM via llama-server (already works)
- Our own `primary_type`/`primary_domain` columns (fix B2/B3)
- No regex fallback needed? (you didn't mention it)

### 6. Generate (Template-Based)

- Kill delegation to `ft md --force`
- Use template string in backticks, closure/function to fill slots
- Something like:

```typescript
const template = `
title: ${title}
type: ${primaryType}
domain: ${primaryDomain}

# ${title}

${content}

## Links
${links.join("\n- ")}
`;
```

- Generate: bookmark stubs, domain pages, category pages, entity pages, master index
- Use our `clippings_text`, `primary_type`, `primary_domain` columns

## Conventions (Your Style)

- Deno/TypeScript, no Node.js
- Shortname imports (`@std/path`)
- Hard-coded defaults, 1-2 params max
- `config.ts` + `BASES` (no reinventing env logic)
- `deno task ch:all` after EVERY file edit (not batches)
- JJ: edit in worktree, atomic commits
- No free-floating module-level code
- Builder pattern: `build()` returns self, `run()` runs it

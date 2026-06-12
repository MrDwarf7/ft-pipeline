# F2 — Unified Extraction (Replace xtracticle.com API)

**Priority: P2 (after F0, F1)** **Goal: Replace xtracticle.com API call with direct X API. Unify
extraction logic from ft-cli + websites repo into `src/extraction/`.**

## Current State

`src/commands/extract.ts` line 396:

```typescript
const resp = await fetch(`${CONFIG.xtracticleBase}/${row.tweet_id}`);
```

This shells out to xtracticle.com as a middleman. We want to hit X's API directly.

## What's Already Good (Keep As-Is)

The processing logic in `extract.ts` is solid:

- `classifyTweet()` — content type classification (X-Articles/X-Posts/X-Media)
- `buildFrontmatter()` — YAML frontmatter generation
- `buildClippingContent()` — markdown assembly
- `extractArticleImages()` — article image extraction
- `extractArticleText()` — article text extraction
- `normalizeMedia()` — media normalization

These become part of `src/extraction/shared.ts` (pure functions, no network/DB).

## What to Port

### 1. From `fieldtheory-cli/src/bookmark-enrich.ts`

- `fetchArticle()` — direct X API call to fetch article content
- `resolveTcoLink()` — expand t.co links

These replace the xtracticle API call.

### 2. Clone Websites Repo

You mentioned cloning the websites repo to compare extraction logic. Once cloned:

```bash
# Clone websites repo (ask Blake for URL)
git clone <websites-repo-url> ~/Documents/GitHub_Projects/websites/
```

Compare:

- How websites extracts article content
- How ft-cli extracts article content
- How xtracticle extracts article content

Unify into `src/extraction/shared.ts`.

## New `src/extraction/` Structure

```
src/extraction/
├── index.ts           # Interfaces (TweetSource, ConnectedSource)
├── graphql.ts         # F0: GraphQL sync implementation
├── xtracticle.ts      # Keep as fallback? Or remove after direct API works
├── websites.ts        # New: Clone websites repo logic, unify
├── shared.ts          # Pure functions (classifyTweet, extractMedia, etc.)
└── types.ts           # TweetData, MediaItem, ArticleData
```

## Refactor `src/commands/extract.ts`

Current: Calls xtracticle API → processes response with local functions.

New:

1. Import from `extraction/shared.ts` for processing functions
2. Import from `extraction/websites.ts` or `extraction/graphql.ts` for API calls
3. Remove duplicated logic (already in `shared.ts`)

```typescript
// commands/extract.ts (simplified)
import { fetchTweetDirectly } from "../extraction/websites.ts"; // or graphql.ts
import { classifyTweet, buildClippingContent, ... } from "../extraction/shared.ts";

const extractSingle = async (row: Row) => {
  // Replace xtracticle API call
  const tweetData = await fetchTweetDirectly(row.tweet_id);

  // Reuse existing processing (now in shared.ts)
  const { dir, type } = classifyTweet(tweetData);
  const content = buildClippingContent(tweetData, type);

  // Save clipping
  const path = `${CONFIG.clippingsBase}/${dir}/${buildFilename(tweetData)}`;
  await Deno.writeTextFile(path, content);

  return { clippingPath: path, status: "extracted" };
};
```

## Websites Repo Integration

After cloning the websites repo:

1. **Identify extraction functions** in websites repo
2. **Port to Deno/TypeScript** (it might be Python/other language)
3. **Unify with ft-cli logic** → `shared.ts`
4. **Add as new source** in `extraction/index.ts`:

```typescript
export { createWebsites } from "./websites.ts";
```

## Config Changes

- **Remove `xtracticleBase`** from `config.ts` + `bases.ts` (once xtracticle is replaced)
- **Add `websitesBase`**? Only if websites repo provides an API. If it's a library, no config
  needed.

## Conventions Checklist

- [ ] Pure functions in `shared.ts` (no side effects)
- [ ] Network calls in separate files (`websites.ts`, `graphql.ts`)
- [ ] Use shortname imports
- [ ] Run `deno task ch:all` after every edit
- [ ] JJ atomic commits

## Success Criteria

- [ ] `deno task extract` works without xtracticle.com API
- [ ] Extraction logic unified between ft-cli, websites repo, and existing code
- [ ] `src/extraction/shared.ts` has all pure processing functions
- [ ] `deno task ch:all` passes
- [ ] `CONFIG.xtracticleBase` removed (no longer needed)

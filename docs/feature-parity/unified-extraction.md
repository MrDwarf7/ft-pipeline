# Feature: Unified Extraction Logic

## What We Want (Your Requirements)

- Share extraction logic between:
  1. fieldtheory-cli's extraction (GraphQL, cookies, article enrichment)
  2. Xtracticle API (used in our `extract.ts`)
- Create a single Deno/TypeScript package/module for reuse
- Common interfaces, shared `classifyTweet`, media extraction

## Current State

- **ft-pipeline**: `extract.ts` uses Xtracticle API only
- **fieldtheory-cli**: Has its own extraction in `graphql-bookmarks.ts`, `bookmarks.ts`
- **No shared code**: Both implement similar logic separately

## Shared Module Plan

Create `utils/extraction/` in ft-pipeline (or separate Deno package):

### Core Interfaces

```typescript
// utils/extraction/types.ts
export interface TweetData {
  id: string;
  text: string;
  raw_text?: string;
  author: { screen_name: string; name: string };
  media?: { all: MediaItem[] };
  article?: ArticleData;
  links_json?: string;
  media_count?: number;
}

export interface MediaItem {
  type: "photo" | "video" | "animated_gif";
  url: string;
  original_img_url?: string;
}

export interface ArticleData {
  title: string;
  preview_text: string;
  content: { blocks: any[]; entityMap: any[] };
  cover_media?: MediaItem;
  media_entities?: MediaItem[];
}
```

### Shared Functions (Pure Logic)

1. **`classifyTweet(tweet: TweetData): string`**
   - Returns: `'X-Articles' | 'X-Posts' | 'X-Media'`
   - Logic (matches current ft-pipeline):
     1. Media only (short/no text, no article) → X-Media
     2. Article blocks OR long text (≥200 chars) → X-Articles
     3. Short text, no article, no media → X-Posts

2. **`extractMedia(tweet: TweetData): MediaItem[]`**
   - Combines: `tweet.media.all` + `article.cover_media` + `article.media_entities`
   - Handles both direct tweet media and article images

3. **`buildClippingContent(tweet: TweetData): string`**
   - Returns markdown with frontmatter + content
   - Reuse in `extract.ts`

4. **`normalizeTweet(tweet: TweetData): TweetData`**
   - Expand t.co links, clean whitespace
   - Pure function, no side effects

### Integration

1. **Refactor `extract.ts`**:
   - Import from `utils/extraction/`
   - Remove duplicated `classifyTweet`, `mediaToMarkdown` logic
   - Keep Xtracticle API call (network) in `extract.ts`, use shared processing

2. **If fieldtheory-cli migrates to Deno later**:
   - They can import the same `utils/extraction/` module
   - Or we publish as separate Deno package

## Conventions

- Pure functions (no DB/network calls in shared module)
- Deno/TypeScript, shortname imports
- Add tests in `utils/extraction/tests/`
- No hard-coded paths (let calling code handle storage)

# F0 — Base GraphQL Port (Sync In-Housing)

**Priority: P0 (blocking all others)** **Goal: Kill `runFtCommand("start", "sync", ...)` delegation.
Replace with native Deno `fetch()` calls using the `extraction/` module pattern (same as `llm/`).**

## Why This First

The entire pipeline depends on `commands/sync.ts` shelling out to `fieldtheory-cli` via
`pnpm start sync`. We can't in-house anything else (extract, generate, folders) without owning the
sync layer. This is the foundation.

## Interface Pattern (mimic `llm/`)

Create `src/extraction/` as a provider module:

```typescript
// src/extraction/index.ts
export interface TweetSource {
  check(): Promise<ConnectedSource>;
}

export interface ConnectedSource {
  fetchBatch(ids?: string[]): Promise<TweetData[]>;
  fetchOne(id: string): Promise<TweetData>;
  label(): string;
}

export { createGraphQL } from "./graphql.ts";
export { createXtracticle } from "./xtracticle.ts";
// Future: export { createWebsites } from "./websites.ts";
```

This means adding a new source later = drop in a new file implementing `TweetSource`. Same pattern
as adding an LLM provider to `llm/`.

## What to Port from `fieldtheory-cli/src/graphql-bookmarks.ts`

### 1. GraphQL Endpoint & Auth

```typescript
const BOOKMARKS_QUERY_ID = "Z9GWmP0kP2dajyckAaDUBw";
const X_PUBLIC_BEARER =
  "AAAAAAAAAAAAAAAAAAAAANRILgAAAAAAnNwIzUejRCOuH5E6I8xnZz4puTs%3D1Zv7ttfk8LF81IUq16cHjhLTvJu4FA33AGWWjCpTnA";

const buildUrl = (cursor?: string, count = 20): string => {
  const variables = JSON.stringify({ count, cursor });
  const features = JSON.stringify(GRAPHQL_FEATURES);
  return `https://x.com/i/api/graphql/${BOOKMARKS_QUERY_ID}/Bookmarks?variables=${variables}&features=${features}`;
};

const buildHeaders = (csrfToken: string, cookieHeader?: string): Record<string, string> => ({
  "authorization": `Bearer ${X_PUBLIC_BEARER}`,
  "x-csrf-token": csrfToken,
  "x-twitter-auth-type": "OAuth2Session",
  "x-twitter-active-user": "yes",
  "content-type": "application/json",
  "user-agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 ...",
  "cookie": cookieHeader ?? `ct0=${csrfToken}`,
});
```

We already have cookie decryption in `commands/cookies.ts`. The `getCookies(password)` call returns
`{ ct0, authToken }`. Use `ct0` as the CSRF token and cookie header.

### 2. Response Parsing

Port `convertTweetToRecord()` (line 238 of graphql-bookmarks.ts) → `src/extraction/graphql.ts`:

```typescript
// Convert X's GraphQL JSON to our TweetData
const convertTweetToRecord = (tweetResult: any, now: string): TweetData | null => {
  const tweet = tweetResult.tweet ?? tweetResult;
  const legacy = tweet?.legacy;
  if (!legacy) return null;

  const tweetId = legacy.id_str ?? tweet?.rest_id;
  if (!tweetId) return null;

  const user = tweet?.core?.user_results?.result;
  const authorHandle = user?.core?.screen_name ?? user?.legacy?.screen_name;
  const authorName = user?.core?.name ?? user?.legacy?.name;

  // Media extraction (reuse from extract.ts shared logic)
  const mediaEntities = legacy?.extended_entities?.media ?? [];
  const media = mediaEntities.map((m: any) => ({
    type: m.type,
    url: m.media_url_https ?? m.media_url,
    ...
  }));

  // Links
  const urlEntities = legacy?.entities?.urls ?? [];
  const links = urlEntities
    .map((u: any) => u.expanded_url)
    .filter((u: string) => u && !u.includes("t.co"));

  // Quoted tweet (optional, keep if needed)
  // ...

  // Note tweet / article text
  const noteText = tweet?.note_tweet?.note_tweet_results?.result?.text;
  const text = noteText ?? legacy.full_text ?? legacy.text ?? "";

  return {
    id: tweetId,
    text,
    author: { screen_name: authorHandle, name: authorName },
    media: { all: media },
    links_json: JSON.stringify(links),
    created_at: legacy.created_at,
    ...
  };
};
```

### 3. Pagination & Rate Limiting

Port `fetchPageWithRetry()` (line 440):

- Cursor-based pagination (`nextCursor` from response)
- 429 retry with `retry-after` header parsing
- Exponential backoff (base 15s, cap 120s)

### 4. DB Import (already in `sync.ts` lines 23-95)

The `importFromFtDb()` function already copies from ft's DB to our `pipeline.db`. Once we fetch
directly via GraphQL, skip ft's DB entirely and upsert directly into `pipeline.db`.

Modify `sync.ts` to:

1. Fetch via `extraction/graphql.ts`
2. Upsert directly into `pipeline.db` (same upsert logic, just change the source)

## Files to Create

```
src/extraction/
├── index.ts          # Interfaces + exports (like llm/index.ts)
├── graphql.ts        # GraphQL implementation (port from graphql-bookmarks.ts)
├── xtracticle.ts     # Existing xtracticle API logic (refactor from extract.ts)
├── shared.ts         # Pure functions: classifyTweet, extractMedia, buildClippingContent
└── types.ts          # TweetData, MediaItem, ArticleData interfaces
```

## Files to Modify

- **`src/commands/sync.ts`**: Rewrite to use `extraction/graphql.ts` instead of `runFtCommand()`.
  Remove `runFtCommand` import. Keep cookie decryption (`checkCookies`, `getCookies`).
- **`src/commands/extract.ts`**: Refactor to import from `extraction/xtracticle.ts` and
  `extraction/shared.ts`. Remove duplicated `classifyTweet`, `buildFrontmatter`, etc.
- **`src/config.ts`**: No changes needed yet (GraphQL uses same cookies).
- **`src/utils/bases.ts`**: Add `graphqlBase`? Not needed — URL is hardcoded (it's a stable X API
  endpoint).

## DB Schema Changes

None needed. The existing `bookmarks` table in `pipeline.db` already has all required fields. We're
just changing the data source from ft's DB → direct X API.

## Conventions Checklist

- [ ] Use shortname imports (`@std/path`, etc.)
- [ ] Hard-code defaults (GraphQL query ID, bearer token)
- [ ] Max 1-2 params per function
- [ ] Builder pattern for any config objects: `buildUrl()`, `buildHeaders()`
- [ ] No free-floating module-level code
- [ ] Run `deno task ch:all` after EVERY file edit
- [ ] JJ: edit in worktree, atomic commits (code, docs, tests separate)

## Testing

1. `deno task sync --dry-run` (add dry-run support if not exist)
2. Verify `pipeline.db` gets populated without running ft-cli
3. Check rate-limit handling (maybe mock a 429 response)
4. Verify folder sync NOT included yet (this is F3, later)

## Bookmark Folders (F3) — Should We Include Now?

The folder GraphQL queries (`BOOKMARK_FOLDERS_QUERY_ID`, `BOOKMARK_FOLDER_TIMELINE_QUERY_ID`) live
in the same `graphql-bookmarks.ts` file. If it's easier to port them during this refactor, do it —
but only if the implementation stays clean:

- Separate `src/extraction/graphql-folders.ts` OR add folder methods to `ConnectedSource` interface
- New DB tables: `bookmark_folders`, `bookmark_folder_tags` (see
  `docs/features/F3-bookmark-folders.md`)
- New CLI flags: `--folders`, `--folder <name>`

**Decision**: If folder porting adds < 100 lines and doesn't complicate the base GraphQL port, bring
it. Otherwise, defer to F3.

## Success Criteria

- [ ] `deno task sync` works without `fieldtheory-cli` installed
- [ ] `pipeline.db` populated directly from X API
- [ ] Rate limiting handled (429 → retry with backoff)
- [ ] Cookies decrypted via `commands/cookies.ts` (no change)
- [ ] `deno task ch:all` passes
- [ ] `src/utils/ft-cli.ts` marked for deletion (delete after F1 + F2 also done)

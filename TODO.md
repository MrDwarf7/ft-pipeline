# TODO — Pipeline Open Issues

Agreed pipeline order: **SYNC → EXTRACT → MERGE → CLASSIFY → GENERATE → INDEXES**

Below: remaining open issues and incomplete steps.

---

## Step 2: EXTRACT ✅ mostly correct (bugs patched)

**Actual flow:**

```
main.ts → Command.Extract → pipeline.extract(args)() → runExtract()
  → open(CONFIG.dbPath)              — SQLite via @db/sqlite
  → queryRows(db, limit)             — SELECT unextracted bookmarks
  → for each row:
      → fetchArticle(tweetId)        — GET xtracticle.com/api/thread/{id}
      → classifyTweet(tweet)         — classify by xtracticle response
      → buildFrontmatter(tweet)      — YAML frontmatter
      → buildClippingContent(tweet)  — frontmatter + title + text + media
      → saveClipping()               — write .md to Clippings/{X-Articles|X-Posts|X-Media}/
      → update db SET clipping_path, content_type WHERE tweet_id
```

**Issues patched:**

- [x] BUG: query excluded media-only bookmarks (no links) → fixed: added
      `OR COALESCE(media_count, 0) > 0`
- [x] BUG: classifyTweet prioritized media over article → fixed: media-only check first, then
      article, then post

**Issues remaining:**

- [ ] classifyTweet uses `tweet.media.all` (direct tweet media) but article media lives in
      `article.cover_media` and `article.media_entities`. Currently, if a tweet has an X Article
      with embedded images, those images are NOT saved to the clipping. The `mediaToMarkdown()` and
      `buildMediaList()` functions only process `tweet.media.all`. Article images need to be
      extracted from article.cover_media and article.media_entities too.
- [ ] xtracticle API responses can be truncated. Should save raw JSON to a temp dir first, then
      process. Currently processes inline and may lose data on large articles.
- [ ] No retry on 429 with exponential backoff — the code has basic retry but could be smarter about
      rate limiting headers.

---

## Step 5: GENERATE ⚠️ delegates to ft CLI, doesn't create planned pages

**Actual flow:**

```
main.ts → Command.Generate → pipeline.generate()() → runGenerate()
  → runFtCommand(["start", "md", "--force"])
       via CONFIG.ftCliDir (env: FT_CLI_DIR, fallback: ~/Documents/.../fieldtheory-cli)
```

**Refactor note (2026-05-05):**

- Extracted hardcoded `ftDir` to `CONFIG.ftCliDir` with `FT_CLI_DIR` env var + fallback
- Now uses `runFtCommand()` helper from `utils/ft-cli.ts`

**Issues:**

- [ ] This just re-runs the FT CLI's md generator. It regenerates existing bookmark stubs in
      `~/.ft-bookmarks/md/` using FT's format. It does NOT create: - Domain pages
      (md/domains/agentic.md, etc.) - Category pages (md/categories/tool.md, etc.) - Entity pages
      (md/entities/mckaywrigley.md, etc.) - Master index (md/index.md) Those are what the AGREED
      plan specifies. The FT CLI doesn't know about our classification results or clippings
      enrichment.
- [ ] Plan says generate should use our `our_*` classification columns, enriched clippings text, and
      create Obsidian-wiki-compatible pages with cross-links.
- [ ] Should NOT delegate to FT CLI — should be our own Deno code that reads from our DB columns and
      generates pages in our format.

---

## Summary: What's Still Open

See `_fixes/` directory for detailed fix specs on each issue. See `AGENTS.md` for project structure,
agreed pipeline, and current status.

| Step     | Status       | Critical Issue                                    | Fix Doc     |
| -------- | ------------ | ------------------------------------------------- | ----------- |
| Sync     | ✅           | Works (refactored: ftDir → config, runFtCommand)  | —           |
| Extract  | ✅ (patched) | Article images not captured from xtracticle       | `_fixes/B4` |
| Generate | ⚠️           | Just re-runs ft CLI, doesn't create planned pages | —           |

## Priority Order for Fixes

1. **Generate** — rewrite to create our own pages (category, domain, entity, index) instead of
   delegating to ft CLI
2. **Extract images** → `_fixes/B4-extract-article-images.md` (P2 — independent of others)

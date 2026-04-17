# TODO — Pipeline Audit & Fixes

Agreed pipeline order: **SYNC → EXTRACT → MERGE → CLASSIFY → GENERATE → INDEXES**

Below: every function call in the actual code, what it does, and where it
diverges from the agreed plan.

---

## Step 1: SYNC ✅ mostly correct

**Actual flow:**
```
main.ts → Command.Sync → pipeline.sync(args)() → runSync()
  → checkCookies()           — verify encrypted cookies exist
  → getCookies(password)     — decrypt X session cookies (ct0, authToken)
  → Deno.Command("pnpm")     — runs `pnpm start sync --cookies <ct0> <authToken> --yes`
       in ~/Documents/GitHub_Projects/JavaScript/fieldtheory-cli
```

**Issues:**
- [x] Works as agreed. Runs ft CLI sync, populates bookmarks.db.
- [ ] The `--yes` flag auto-confirms — should maybe prompt on rebuild?
      Low priority, fine for now.

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
- [x] BUG: query excluded media-only bookmarks (no links) → fixed: added `OR COALESCE(media_count, 0) > 0`
- [x] BUG: classifyTweet prioritized media over article → fixed: media-only check first, then article, then post

**Issues remaining:**
- [ ] classifyTweet uses `tweet.media.all` (direct tweet media) but article media
      lives in `article.cover_media` and `article.media_entities`. Currently, if a
      tweet has an X Article with embedded images, those images are NOT saved to the
      clipping. The `mediaToMarkdown()` and `buildMediaList()` functions only process
      `tweet.media.all`. Article images need to be extracted from article.cover_media
      and article.media_entities too.
- [ ] xtracticle API responses can be truncated. Should save raw JSON to a temp
      dir first, then process. Currently processes inline and may lose data on
      large articles.
- [ ] No retry on 429 with exponential backoff — the code has basic retry but
      could be smarter about rate limiting headers.

---

## Step 3: MERGE ❌ MISSING from pipeline

**Agreed:** Between EXTRACT and CLASSIFY, merge Clippings text back into DB
so the classifier has enriched content (full article text, not just tweet text).

**What should happen:**
```
MERGE:
  → read all .md files from Clippings/{X-Articles, X-Posts, X-Media}/
  → parse frontmatter (tweet_id) + body text
  → match by tweet_id against bookmarks table
  → priority: articles > posts > media
  → UPDATE bookmarks SET clippings_text = ?, clippings_type = ?, clippings_source_file = ? WHERE tweet_id
  → clippings_text capped at 5000 chars
```

**Current state:**
- merge-clippings.py exists in `_archive/` workspace folder (Python, uv run)
- NOT integrated into the Deno pipeline at all
- NOT called by `deno task full` — the full pipeline goes Sync → Extract → Classify → Generate → Indexes
- No `merge` command in types.ts Command enum
- No `merge` task in deno.json

**What needs to happen:**
- [ ] Port merge-clippings.py to Deno (commands/merge.ts) OR wire the Python
      script into the pipeline via Deno.Command like sync does
- [ ] Add `merge` to Command enum in types.ts
- [ ] Add `pipeline.merge` to pipeline.ts
- [ ] Insert MERGE between EXTRACT and CLASSIFY in runFull()
- [ ] Add `merge` task to deno.json
- [ ] Verify the merge writes to `clippings_text` column (may need to ALTER TABLE ADD COLUMN)

---

## Step 4: CLASSIFY ⚠️ wrong columns, no enrichment

**Actual flow:**
```
main.ts → Command.Classify → pipeline.classify(args)()
  → llm.check()                          — verify llama-server is up
  → runClassify(llm, options)
      → queryUnclassified(db)            — WHERE primary_category = 'unclassified' OR IS NULL
      → chunk(rows, 50)                  — batch into groups
      → for each row:
          → classifyRow(db, llm, row)
              → content = row.article_text || row.text  ← uses OLD enrichment!
              → if content < 10 chars → markShortTweet() as meme-shitpost
              → classifyWithLLM(llm, content, author)
                  → buildPrompt(content, author)       — sends to Gemma
                  → llm.chat()                          — temperature: 0.3, maxTokens: 200
                  → parseLLMResponse()                  — extract JSON from response
              → saveClassification(db, tweetId, result)
                  → UPDATE bookmarks SET primary_category, primary_domain, classification_confidence
```

**Issues:**
- [x] Uses `row.article_text || row.text` — this reads the OLD `article_text` column
      (only 27 rows populated from a previous enrichment attempt). Should read
      `clippings_text` instead (populated by the MERGE step which doesn't exist yet).
      After merge, `clippings_text` has full article/post/media content for ~1769 bookmarks.
- [ ] Writes to `primary_category`, `primary_domain` — these are FT's OLD columns.
      The plan says to write to `our_primary_type`, `our_primary_domain` (with `our_` prefix).
      Currently overwrites ft's existing classifications. Should use `our_*` columns.
- [ ] Also writes `classification_confidence` — plan says `our_confidence`.
- [ ] Doesn't store multi-label arrays — plan says also store `our_type` (JSON array),
      `our_domains` (JSON array), `our_classified_at` (ISO timestamp).
      Currently only stores primary_type and primary_domain.
- [ ] No system prompt — plan specifies a detailed system prompt with taxonomy
      definitions, decision helpers, and confidence scale. Currently just has a
      flat user prompt. Should add system message with full taxonomy.
- [ ] Temperature is 0.3 — plan says 0.1 for deterministic classification.
- [ ] Prompt uses `content.slice(0, 1500)` — plan says cap at 2000 chars.
- [ ] Batching is sequential per row (with Promise.all within a batch, but
      sequential batches). Plan says 4 parallel requests for concurrent dispatch.
- [ ] No confidence threshold filtering — plan says flag < 0.7 for review.
      Currently saves everything regardless of confidence.
- [ ] No backup JSON output — plan says write classification-results.json.

---

## Step 5: GENERATE ⚠️ delegates to ft CLI, doesn't create planned pages

**Actual flow:**
```
main.ts → Command.Generate → pipeline.generate()() → runGenerate()
  → Deno.Command("pnpm") — runs `pnpm start md --force` in fieldtheory-cli
```

**Issues:**
- [ ] This just re-runs the FT CLI's md generator. It regenerates existing bookmark
      stubs in `~/.ft-bookmarks/md/` using FT's format. It does NOT create:
      - Domain pages (md/domains/agentic.md, etc.)
      - Category pages (md/categories/tool.md, etc.)
      - Entity pages (md/entities/mckaywrigley.md, etc.)
      - Master index (md/index.md)
      Those are what the AGREED plan specifies. The FT CLI doesn't know about
      our classification results or clippings enrichment.
- [ ] Plan says generate should use our `our_*` classification columns, enriched
      clippings text, and create Obsidian-wiki-compatible pages with cross-links.
- [ ] Should NOT delegate to FT CLI — should be our own Deno code that reads
      from our DB columns and generates pages in our format.

---

## Step 6: INDEXES ✅ correct structure, but incomplete

**Actual flow:**
```
main.ts → Command.Indexes → pipeline.indexes()() → runIndexes()
  → query classified bookmarks WHERE primary_category IS NOT NULL
  → group by primary_category → write md/categories/{cat}.md
  → group by primary_domain → write md/domains/{domain}.md
  → write master index.md with counts
```

**Issues:**
- [ ] Reads from `primary_category` / `primary_domain` (ft's old columns).
      Should read from `our_primary_type` / `our_primary_domain` after classify
      is fixed to write there.
- [ ] Generates category + domain indexes but NOT entity pages (per-author).
      Plan specifies md/entities/{handle}.md for authors with 5+ bookmarks.
- [ ] Format is basic — plan says pages should include cross-links
      (e.g., `[[domains/agentic]]`, `[[categories/technique]]`, `[[entities/handle]]`).
      Currently no cross-links.
- [ ] Doesn't include clippings text summaries in the index entries.
      Plan says include enriched content summaries.
- [ ] Output goes to `CONFIG.mdOutputDir` (`~/.ft-bookmarks/md/`) which is correct,
      but the pages created by generate (ft CLI) and indexes (our code) may
      conflict or overlap. Need to separate concerns.

---

## Summary: What's Actually Broken

See `_fixes/` directory for detailed fix specs on each issue.
See `AGENTS.md` for project structure, agreed pipeline, and current status.

| Step | Status | Critical Issue | Fix Doc |
|------|--------|---------------|---------|
| Sync | ✅ | Works | — |
| Extract | ✅ (patched) | Article images not captured from xtracticle | `_fixes/B4` |
| Merge | ❌ MISSING | Entire step missing from pipeline | `_fixes/B1` |
| Classify | ⚠️ | Writes wrong columns, no enrichment, no system prompt | `_fixes/B2`, `B3` |
| Generate | ⚠️ | Just re-runs ft CLI, doesn't create planned pages | — |
| Indexes | ⚠️ | Wrong columns, no entity pages, no cross-links | `_fixes/B5` |

## Priority Order for Fixes

1. **Merge** → `_fixes/B1-merge-step-missing.md` (P1 — blocks classification quality)
2. **Classify columns** → `_fixes/B2-classify-wrong-columns.md` (P1 — overwrites ft data)
3. **Classify prompt** → `_fixes/B3-classify-prompt-incomplete.md` (P2 — quality suffers)
4. **Extract images** → `_fixes/B4-extract-article-images.md` (P2 — independent of others)
5. **Generate** — rewrite to create our own pages instead of delegating to ft CLI
6. **Indexes** → `_fixes/B5-indexes-wrong-columns.md` (P2 — reads stale columns)

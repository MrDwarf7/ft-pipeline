# F1 — Generate (Template-Based, Using `src/llm/`)

**Priority: P1 (after F0)** **Goal: Kill `runFtCommand(["start", "md", "--force"])` delegation.
Rewrite `generate.ts` using template closures + `src/llm/` interface.**

## Why Not Port `fieldtheory-cli/src/md.ts`

Blake's note: _"We won't be using the same 'ft md' command... we can generate the markdown output
content ourselves pretty easily, and likely with better performance too."_

The ft-cli's `md.ts`:

- Only supports Claude + Codex (2 backends)
- Uses Node.js (`crypto`, `fs`, `path`)
- Has incremental compilation with SHA-256 hashes (we can reimplement simpler)

Our `src/llm/`:

- Supports OpenAI-compatible (llama-server, OpenAI, Anthropic, etc.)
- Already in Deno/TypeScript
- Adding a new provider = drop file in `llm/`, export from `index.ts`

So we write from scratch, using our own LLM interface.

## Template Closures (Your Style)

From `docs/feature-parity/generate-template.md`:

```typescript
// src/utils/templates.ts
import type { BookmarkData } from "../types.ts";

export const generateBookmarkPage = (data: BookmarkData) =>
  `---
title: ${data.title}
type: ${data.primaryType}
domain: ${data.primaryDomain}
author: @${data.authorHandle}
date: ${data.postedAt}
---

# ${data.title}

${data.content}

## Links
${data.links.map((l) => `- ${l}`).join("\n")}

## Metadata
- Tweet ID: ${data.tweetId}
- URL: ${data.url}
`;

export const generateDomainPage = (domain: string, bookmarks: BookmarkData[]) =>
  `---
title: ${domain}
type: domain-index
---

# ${domain}

${bookmarks.map((b) => `- [[${b.tweetId}]] ${b.title}`).join("\n")}
`;

export const generateCategoryPage = (category: string, bookmarks: BookmarkData[]) =>
  `---
title: ${category}
type: category-index
---

# ${category}

${bookmarks.map((b) => `- [[${b.tweetId}]] ${b.title}`).join("\n")}
`;

export const generateEntityPage = (entity: string, bookmarks: BookmarkData[]) =>
  `---
title: ${entity}
type: entity-index
---

# ${entity}

${bookmarks.map((b) => `- [[${b.tweetId}]] ${b.title}`).join("\n")}
`;

export const generateMasterIndex = (domains: string[], categories: string[]) =>
  `---
title: Bookmarks Index
type: master-index
---

# Bookmarks Index

## Domains
${domains.map((d) => `- [[domains/${d}.md]]`).join("\n")}

## Categories
${categories.map((c) => `- [[categories/${c}.md]]`).join("\n")}
`;
```

Hard-coded defaults, 1-2 params, backtick templates. No over-engineering.

## Pages to Generate

1. **Bookmark stubs**: Individual `.md` files per bookmark (use `generateBookmarkPage`)
2. **Domain pages**: `md/domains/agentic.md`, `md/domains/ai-ml.md`, etc.
3. **Category pages**: `md/categories/tool.md`, `md/categories/research.md`, etc.
4. **Entity pages**: `md/entities/mckaywrigley.md`, `md/entities/anthropic.md`, etc.
5. **Master index**: `md/index.md` with links to all categories/domains

All use Obsidian `[[wiki-link]]` syntax for cross-linking.

## Using `src/llm/` for Summaries

For domain/category/entity pages, we might want LLM-generated summaries. Use the existing `llm/`
interface:

```typescript
// src/commands/generate.ts
import { createOpenAICompat } from "../llm/index.ts";
import { CONFIG } from "../config.ts";

const provider = createOpenAICompat({
  baseUrl: CONFIG.llmBase,
  model: CONFIG.llmModel,
});

const llm = await provider.check();
const summary = await llm.chat({
  messages: [
    { role: "system", content: "Summarize these bookmarks..." },
    { role: "user", content: bookmarksText },
  ],
});
```

This works for any OpenAI-compatible endpoint (llama-server, OpenAI API, etc.).

## Rewrite `src/commands/generate.ts`

Current state (line 1-17): Just delegates to `ft md --force`.

New implementation:

```typescript
// commands/generate.ts
import { Database } from "@db/sqlite";
import { CONFIG } from "../config.ts";
import { logger } from "../utils/logger.ts";
import { generateBookmarkPage, generateDomainPage, ... } from "../utils/templates.ts";
import { createOpenAICompat } from "../llm/index.ts";

export const runGenerate = async (): Promise<void> => {
  logger.info("generate started — using native templates + llm");

  const db = new Database(CONFIG.pipelineDbPath);
  
  // 1. Read bookmarks from our DB (using our columns)
  const rows = db.prepare(`
    SELECT tweet_id, url, text, author_handle, author_name, posted_at,
           primary_type, primary_domain, clippings_text, links_json
    FROM bookmarks
    WHERE primary_type IS NOT NULL
    ORDER BY posted_at DESC
  `).all<BookmarkRow>();

  // 2. Generate bookmark stubs
  for (const row of rows) {
    const md = generateBookmarkPage({
      tweetId: row.tweet_id,
      title: row.clippings_text?.slice(0, 100) ?? row.text.slice(0, 100),
      primaryType: row.primary_type,
      primaryDomain: row.primary_domain,
      authorHandle: row.author_handle,
      postedAt: row.posted_at,
      content: row.clippings_text ?? row.text,
      links: JSON.parse(row.links_json ?? "[]"),
      url: row.url,
    });
    const path = `${CONFIG.mdOutputDir}/${row.tweet_id}.md`;
    await Deno.writeTextFile(path, md);
  }

  // 3. Generate domain/category/entity pages (using LLM summaries if needed)
  // ...

  logger.info(`generate complete — ${rows.length} pages written`);
};
```

## Config Changes

`config.ts` already has `mdOutputDir: envOrFallback("FT_MARKDOWN_DIR", BASES.mdOutputDir)`. No
changes needed — generate outputs to `~/.ft-bookmarks/md/` via config.

## Files to Create

- **`src/utils/templates.ts`**: Template closures (above)
- Update **`src/commands/generate.ts`**: Rewrite completely

## Files to Delete (After F0 + F1 + F2 Done)

- **`src/utils/ft-cli.ts`**: `runFtCommand()` helper (no longer needed after sync + generate +
  extract all native)

## Conventions Checklist

- [ ] Use shortname imports
- [ ] Template closures with backticks (your style)
- [ ] Use `src/llm/` for any LLM calls (don't create new LLM client)
- [ ] Hard-coded defaults, minimal params
- [ ] Run `deno task ch:all` after every edit
- [ ] JJ atomic commits

## Success Criteria

- [ ] `deno task generate` works without `fieldtheory-cli`
- [ ] Bookmark stubs generated with correct frontmatter (`primary_type`, `primary_domain`)
- [ ] Domain/category/entity pages created (can be simple lists initially)
- [ ] Master index created
- [ ] `deno task ch:all` passes

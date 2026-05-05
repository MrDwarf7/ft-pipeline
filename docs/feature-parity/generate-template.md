# Feature: Generate (Template-Based)

## What We Want (Your Requirements)

- **Kill delegation to `ft md --force`** — implement natively
- Use **template string in backticks** with a closure/function
- Fill slots in template with variables (bookmark data)
- Something like:

```typescript
// Template as a closure
const generateBookmarkPage = (data: BookmarkData) =>
  `---
title: \`${data.title}\`
type: \`${data.primaryType}\`
domain: \`${data.primaryDomain}\`
author: \`@${data.authorHandle}\`
date: \`${data.postedAt}\`
---

# \`${data.title}\`

\`${data.content}\`

## Links
\`${data.links.map((l) => `- ${l}`).join("\n")}\`

## Metadata
- Tweet ID: \`${data.tweetId}\`
- URL: \`${data.url}\`
`;
```

## Current State

- `generate.ts` just runs `ft md --force` (delegates to ft-cli)
- Doesn't create planned pages: domain pages, category pages, entity pages, master index
- Doesn't use our `primary_type`, `clippings_text`, `primary_domain` columns

## Porting Plan

1. **Rewrite `generate.ts`**:
   - Read from `pipeline.db` (our columns: `primary_type`, `primary_domain`, `clippings_text`)
   - Use template closures like above
   - Generate to `~/.ft-bookmarks/md/`

2. **Pages to Generate**:
   - **Bookmark stubs**: Individual `.md` files per bookmark (existing)
   - **Domain pages**: `domains/agentic.md`, `domains/ai-ml.md`, etc.
   - **Category pages**: `categories/tool.md`, `categories/research.md`, etc.
   - **Entity pages**: `entities/mckaywrigley.md`, `entities/anthropic.md`, etc.
   - **Master index**: `index.md` with links to all categories/domains

3. **Template Approach**:
   - Define templates as closures in `utils/templates.ts`
   - Each template is a function: `(data: T) => string`
   - Use backtick strings with `${variable}` interpolation
   - Keep templates simple: 1-2 params max (your style)

4. **Cross-Links**:
   - Obsidian-compatible `[[wiki-link]]` syntax
   - Auto-link between bookmark pages and category/domain pages
   - Extract entities from `clippings_text` (regex or LLM-generated)

## Conventions

- Builder pattern: `build()` returns self, `run()` runs it
- No free-floating module-level code
- Use our DB columns (`primary_type`, `primary_domain`, etc.)
- `deno task ch:all` after every edit
- Hard-code defaults, minimal params (your style)

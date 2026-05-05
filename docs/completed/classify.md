# CLASSIFY Step — Complete

**Date completed:** 2026-05-05 **Status:** ✅ Fully implemented (schema-aligned)

## What Was Done

The CLASSIFY step uses a local LLM (Gemma via llama-server) to classify bookmarks by type and
domain. Results are written to pipeline.db columns.

## Implementation

**Files:**

- `commands/classify.ts` — orchestrator: queries, batches, parallel dispatch, logging
- `commands/classify-db.ts` — DB operations: queryUnclassified, markShortTweet, saveClassification
- `commands/classify-llm.ts` — LLM prompt, call, response parsing with JSON schema validation

## Pipeline

```
queryUnclassified(db) → chunk rows → Promise.all batches → classifyRow per row:
  → content = clippings_text || text (enriched fallback)
  → short tweets (<10 chars) → markShortTweet() as meme-shitpost
  → classifyWithLLM(llm, content, author, tweetId)
      → SYSTEM_PROMPT with full taxonomy, rules, confidence scale
      → buildPrompt(content, author, tweetId) — capped at 2000 chars
      → llm.chat() — temperature: 0.1, maxTokens: 500, JSON schema
      → parseLLMResponse() — extract and validate JSON
  → saveClassification(db, tweetId, result)
      → types (JSON array), primary_type, domains (JSON array), primary_domain
      → classified_at (ISO timestamp), confidence (0-1)
  → CONFIDENCE_THRESHOLD (0.7) check — warns on low confidence
  → Write classification-results.json backup
```

## Taxonomy

**Types:** tool, technique, launch, research, opinion, security, news, meme-shitpost, tutorial,
resource

**Domains:** agentic, ai-ml, security, devops, programming, geopolitics, conspiracy, health,
finance, crypto, media, culture, science

## API / Usage

```bash
deno task start classify              # Classify all unclassified bookmarks
deno task start classify --limit 50   # Classify 50 bookmarks
deno task start classify --dry-run    # Preview without writing
```

## Schema

Writes to pipeline.db `bookmarks` table:

- `types` — JSON array (e.g., `["tool", "technique"]`)
- `primary_type` — single best fit (e.g., `"tool"`)
- `domains` — JSON array (e.g., `["agentic", "devops"]`)
- `primary_domain` — single best fit (e.g., `"agentic"`)
- `classified_at` — ISO timestamp
- `confidence` — 0-1 float

## Notes

- Uses `clippings_text` (enriched by MERGE step) with fallback to `text`
- Comprehensive SYSTEM_PROMPT with taxonomy, rules (crypto contained, geopolitics ≠ conspiracy), and
  confidence scale
- Temperature 0.1 for deterministic classification
- Parallel batch processing via `Promise.all`
- Backup JSON written to `~/.ft-bookmarks/classification-results.json`

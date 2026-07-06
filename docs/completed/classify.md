# CLASSIFY Step -- Complete

**Date completed:** 2026-05-05 **Status:** Fully implemented (schema-aligned)

## What Was Done

The CLASSIFY step uses a local LLM (via llama-server) to classify bookmarks by type and domain.
Results are written to pipeline.db columns.

## Implementation

**Files:**

- `src/commands/classify.ts` -- orchestrator: queries, batches, parallel dispatch, logging
- `src/commands/classify-db.ts` -- DB operations: queryUnclassified, markShortTweet,
  saveClassification
- `src/commands/classify-llm.ts` -- LLM prompt, call, response parsing with JSON schema validation

## Pipeline

```
queryUnclassified(db) -> chunk rows -> Promise.all batches -> classifyRow per row:
  -> content = clippings_text || text (enriched fallback)
  -> short tweets (<10 chars) -> markShortTweet() as meme-shitpost
  -> classifyWithLLM(llm, content, author, tweetId)
      -> SYSTEM_PROMPT with full taxonomy, rules, confidence scale
      -> buildPrompt(content, author, tweetId) -- capped at 2000 chars
      -> llm.chat() -- temperature: 0.1, maxTokens: 500, JSON schema
      -> parseLLMResponse() -- extract and validate JSON
  -> saveClassification(db, tweetId, result)
      -> types (JSON array), primary_type, domains (JSON array), primary_domain
      -> classified_at (ISO timestamp), confidence (0-1)
  -> CONFIDENCE_THRESHOLD (0.7) check -- warns on low confidence
  -> Write classification-results.json backup
```

## Taxonomy

**Types:** tool, technique, launch, research, opinion, security, news, meme-shitpost, tutorial,
resource

**Domains:** agentic, ai-ml, security, devops, programming, geopolitics, conspiracy, health,
finance, crypto, media, culture, science

## Usage

```bash
deno task classify              # Classify unclassified bookmarks
deno task classify --dry-run   # Preview unclassified bookmarks
deno task classify --limit 20  # Classify first 20 only
```

# B3 — Classify prompt and LLM settings incomplete
**Priority:** P2 — Important
**Status:** Classification quality suffers without proper prompt

## Problem

The current classify prompt is a flat user message with no system prompt, wrong
temperature, and truncated content. The agreed plan specifies:

1. **System prompt** with full taxonomy definitions, decision helpers, confidence scale
2. **Temperature 0.1** (currently 0.3) for deterministic classification
3. **Content cap at 2000 chars** (currently 1500)
4. **Use clippings_text** when available (currently uses article_text, only 27 rows)
5. **Confidence threshold** — flag < 0.7 for review, don't just store blindly
6. **Backup JSON output** — write classification-results.json

The prompt is the quality bottleneck. A bad prompt with a great model still
produces garbage classifications.

## Steps

### 1. Add system prompt constant

In classify.ts, add the full system prompt from the plan. This defines the
taxonomy, decision helpers, and output format:

```typescript
const SYSTEM_PROMPT = `You classify X/Twitter bookmarks. Each bookmark is a tweet — some are tech
tools, some are conspiracy threads, some are just memes. Your job is to figure
out what KIND of thing it is (type) and what it's ABOUT (domain).

TYPES (what kind of content):
- tool: GitHub repos, CLI tools, npm packages, open-source projects, dev tools
- technique: patterns, architecture ideas, "how I built X", code patterns
- launch: "just shipped v2", product announcements, new releases
- research: academic papers, arxiv links, scientific findings
- opinion: hot takes, threads, "lessons learned", commentary, analysis
- security: CVEs, vulnerabilities, exploits, breaches, hacking stories
- news: current events, breaking news, factual reporting
- meme-shitpost: jokes, reactions, one-liners, "based", low-effort bangers
- tutorial: step-by-step guides, walkthroughs
- resource: link lists, curations, "awesome-X", reference collections

DOMAINS (what it's about):
- agentic: AI agents, Claude Code, OpenClaw, Hermes, skills, plugins, MCP
- ai-ml: ML models, training, inference, benchmarks (NOT agent-specific)
- security: infosec, hacking, CVEs, surveillance, privacy, digital rights
- devops: infrastructure, deployment, CI/CD, containers, cloud
- programming: coding languages, frameworks, dev tools, git
- geopolitics: governments, elections, wars, trade wars, policy, legislation
- conspiracy: alternative narratives, deep state, UFOs, cover-ups, psyops
- health: health, biohacking, supplements, medicine, nutrition
- finance: markets, stocks, bonds, economics, monetary policy
- crypto: cryptocurrency, blockchain, DeFi (CONTAINED domain)
- media: videos, documentaries, podcasts, long-form content
- culture: social commentary, entertainment, generational takes
- science: hard sciences, physics, astronomy, biology

CRITICAL RULES:
- crypto is its own CONTAINED domain. Do NOT bleed into finance.
- geopolitics and conspiracy are SEPARATE. Elections/wars → geopolitics. UFOs/cover-ups → conspiracy.
- agentic generalizes Claude Code, OpenClaw, Hermes, Codex, etc. Use ai-ml only for model architecture/training/benchmarks.
- Multi-domain is fine. A tweet about "Claude Code skill for Kubernetes" could be domains=["agentic","devops"].
- Each bookmark gets ONE primary_type and ONE primary_domain (single best fit).
- meme-shitpost type overrides domain priority but still assign best-guess domain.

CONFIDENCE:
- 0.9+: Very clear, obvious fit
- 0.7-0.9: Reasonably sure
- 0.5-0.7: Could go multiple ways
- Below 0.5: Genuinely unsure

Return ONLY a JSON array. No markdown fences. No explanation.
[{\"id\":\"...\",\"types\":[\"...\"],\"primary_type\":\"...\",\"domains\":[\"...\"],\"primary_domain\":\"...\",\"confidence\":0.95},...]`;
```

### 2. Update classifyWithLLM to use system prompt

```typescript
const classifyWithLLM = async (
  llm: ConnectedLLM,
  content: string,
  author: string,
): Promise<ClassificationResult> => {
  const text = await llm.chat({
    messages: [
      { role: "system", content: SYSTEM_PROMPT },  // ← NEW
      { role: "user", content: buildPrompt(content, author) },
    ],
    temperature: 0.1,   // ← was 0.3
    maxTokens: 500,     // ← bump for multi-label JSON
    jsonSchema: CLASSIFY_SCHEMA,
  });
  return parseLLMResponse(text);
};
```

### 3. Update buildPrompt to use clippings_text

The prompt should accept enriched content from clippings, not just tweet text:

```typescript
const buildPrompt = (content: string, author: string, tweetId: string): string =>
  `Classify this bookmarked tweet by @${author} (id: ${tweetId}).

Content:
---
${content.slice(0, 2000)}
---

Return JSON with types (array), primary_type (single), domains (array), primary_domain (single), confidence (0-1).`;
```

### 4. Update classifyRow to use clippings_text

```typescript
const classifyRow = async (db: Database, llm: ConnectedLLM, row: Row): Promise<ClassifyResult> => {
  // Use clippings_text (from merge) when available, fallback to article_text, then text
  const content = row.clippings_text || row.article_text || row.text;

  if (!content || content.trim().length < 10) {
    markShortTweet(db, row.tweet_id);
    return "classified";
  }

  const result = await classifyWithLLM(llm, content, row.author_handle);
  // ... rest unchanged
};
```

Also update the Row interface in classify.ts:
```typescript
interface Row {
  tweet_id: string;
  text: string;
  author_handle: string;
  article_text: string | null;
  clippings_text: string | null;  // ← ADD
}
```

And update queryUnclassified SELECT to include clippings_text:
```sql
SELECT tweet_id, text, author_handle, article_text, clippings_text
FROM bookmarks
WHERE our_primary_type IS NULL
```

### 5. Add confidence threshold check

After classifying, log warnings for low-confidence results:

```typescript
const CONFIDENCE_THRESHOLD = 0.7;

// In classifyRow, after saveClassification:
if (result.confidence < CONFIDENCE_THRESHOLD) {
  logger.warn("low confidence classification", {
    tweet_id: row.tweet_id,
    primary_type: result.primary_type,
    confidence: result.confidence,
  });
}
```

### 6. Write classification-results.json

After all batches complete, write a JSON backup:

```typescript
// At the end of runClassify, after summarize():
const resultsOutput = {
  run_at: new Date().toISOString(),
  model: llm.modelName() ?? "unknown",
  total_classified: classified,
  failed,
  confidence_threshold: CONFIDENCE_THRESHOLD,
  results: allResults,  // collect during processing
};

await Deno.writeTextFile(
  `${Deno.env.get("HOME")}/.ft-bookmarks/classification-results.json`,
  JSON.stringify(resultsOutput, null, 2),
);
```

### 7. Verify

```bash
deno task classify --limit 5
sqlite3 ~/.ft-bookmarks/bookmarks.db "
  SELECT tweet_id, our_primary_type, our_primary_domain, our_confidence
  FROM bookmarks
  WHERE our_confidence IS NOT NULL
  ORDER BY our_confidence ASC
  LIMIT 5
"
# Low confidence ones should be logged as warnings
```

## Acceptance Criteria

- [ ] System prompt with full taxonomy, decision helpers, confidence scale
- [ ] Temperature 0.1 (deterministic)
- [ ] Content cap 2000 chars
- [ ] Uses clippings_text when available (from merge step)
- [ ] Confidence threshold 0.7 — low-confidence entries flagged in logs
- [ ] classification-results.json written after each run

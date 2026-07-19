/** LLM prompt, call, and response parsing for classification. */

import { DOMAINS, TYPES } from "../config.ts";
import { type ConnectedLLM } from "../llm/index.ts";

export interface ClassificationResult {
  types: string[];
  primary_type: string;
  domains: string[];
  primary_domain: string;
  confidence: number;
}

export type ClassifyResult = "classified" | "failed";

export const CONFIDENCE_THRESHOLD = 0.7;

const SYSTEM_PROMPT =
  `You classify X/Twitter bookmarks. Each bookmark is a tweet — some are tech tools, some are conspiracy threads, some are just memes. Your job is to figure out what KIND of thing it is (type) and what it's ABOUT (domain).

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
[{"id":"...","types":["..."],"primary_type":"...","domains":["..."],"primary_domain":"...","confidence":0.95},...]`;

const buildPrompt = (content: string, author: string, tweetId: string): string =>
  `Classify this bookmarked tweet by @${author} (id: ${tweetId}).

Content:
---
${content.slice(0, 2000)}
---

Return JSON with types (array), primary_type (single), domains (array), primary_domain (single), confidence (0-1).`;

export const parseLLMResponse = (text: string): ClassificationResult => {
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error(`No JSON in response: ${text.slice(0, 100)}`);

  const result = JSON.parse(jsonMatch[0]);

  const types = Array.isArray(result.types) ? result.types : [result.primary_type];
  const domains = Array.isArray(result.domains) ? result.domains : [result.primary_domain];

  return {
    types: types.filter((t: string): t is typeof TYPES[number] =>
      (TYPES as readonly string[]).includes(t)
    ),
    primary_type: TYPES.includes(result.primary_type) ? result.primary_type : "opinion",
    domains: domains.filter((d: string): d is typeof DOMAINS[number] =>
      (DOMAINS as readonly string[]).includes(d)
    ),
    primary_domain: DOMAINS.includes(result.primary_domain) ? result.primary_domain : "culture",
    confidence: typeof result.confidence === "number"
      ? Math.min(1, Math.max(0, result.confidence))
      : 0.5,
  };
};

const CLASSIFY_SCHEMA = {
  type: "object" as const,
  properties: {
    types: { type: "array", items: { type: "string" } },
    primary_type: { type: "string" },
    domains: { type: "array", items: { type: "string" } },
    primary_domain: { type: "string" },
    confidence: { type: "number" },
  },
  required: [
    "types",
    "primary_type",
    "domains",
    "primary_domain",
    "confidence",
  ],
};

export const classifyWithLLM = async (
  llm: ConnectedLLM,
  content: string,
  author: string,
  tweetId: string,
): Promise<ClassificationResult> => {
  const text = await llm.chat({
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: buildPrompt(content, author, tweetId) },
    ],
    temperature: 0.1,
    maxTokens: 500,
    jsonMode: "json_object",
    jsonSchema: CLASSIFY_SCHEMA,
  });
  return parseLLMResponse(text);
};

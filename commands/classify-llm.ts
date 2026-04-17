// commands/classify-llm.ts -- LLM prompt, call, and response parsing for classification
// B3: change system prompt, temperature, confidence thresholding

import { CONFIG, DOMAINS, TYPES } from "../config.ts";
import { logger } from "../utils/logger.ts";
import { type ConnectedLLM } from "../llm/index.ts";

export interface ClassificationResult {
  types: string[];
  primary_type: string;
  domains: string[];
  primary_domain: string;
  confidence: number;
}

export type ClassifyResult = "classified" | "failed";

const buildPrompt = (content: string, author: string): string =>
  `Classify this bookmarked tweet. Respond with ONLY valid JSON.

TYPES: ${TYPES.join(", ")}
DOMAINS: ${DOMAINS.join(", ")}

Tweet by @${author}:
---
${content.slice(0, 1500)}
---

Return JSON with this exact shape:
{"types": ["type1"], "primary_type": "type1", "domains": ["domain1"], "primary_domain": "domain1", "confidence": 0.85}`;

export const parseLLMResponse = (text: string): ClassificationResult => {
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error(`No JSON in response: ${text.slice(0, 100)}`);

  const result = JSON.parse(jsonMatch[0]);

  return {
    ...result,
    primary_type: TYPES.includes(result.primary_type)
      ? result.primary_type
      : "opinion",
    primary_domain: DOMAINS.includes(result.primary_domain)
      ? result.primary_domain
      : "culture",
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
): Promise<ClassificationResult> => {
  const text = await llm.chat({
    messages: [{ role: "user", content: buildPrompt(content, author) }],
    temperature: 0.3,
    maxTokens: 200,
    jsonSchema: CLASSIFY_SCHEMA,
  });
  return parseLLMResponse(text);
};

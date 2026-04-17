// commands/classify.ts -- LLM classification via local Gemma

import { Database } from "https://deno.land/x/sqlite3@0.12.0/mod.ts";
import { CONFIG, DOMAINS, TYPES } from "../config.ts";
import { logger } from "../utils/logger.ts";
import { type ConnectedLLM } from "../llm/index.ts";

interface ClassifyOptions {
  dryRun?: boolean;
  limit?: number;
}

interface ClassificationResult {
  types: string[];
  primary_type: string;
  domains: string[];
  primary_domain: string;
  confidence: number;
}

interface Row {
  tweet_id: string;
  text: string;
  author_handle: string;
  article_text: string | null;
}

type ClassifyResult = "classified" | "failed";

const queryUnclassified = (db: Database, limit?: number): Row[] =>
  db
    .prepare(`
    SELECT tweet_id, text, author_handle, article_text
    FROM bookmarks
    WHERE primary_category = 'unclassified' OR primary_category IS NULL
    ORDER BY posted_at DESC
    ${limit ? `LIMIT ${limit}` : ""}
  `)
    .all<Row>();

const dryRunPreview = (rows: Row[]) => {
  logger.info("dry run — showing first 5 unclassified bookmarks", { total: rows.length });
  rows
    .slice(0, 5)
    .forEach((row) =>
      logger.info(`  [${row.tweet_id}] ${row.text.slice(0, 80)}...`, {
        author: row.author_handle,
      }),
    );
};

const chunk = <T>(arr: T[], size: number): T[][] =>
  Array.from({ length: Math.ceil(arr.length / size) }, (_, i) =>
    arr.slice(i * size, i * size + size),
  );

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

const parseLLMResponse = (text: string): ClassificationResult => {
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

const classifyWithLLM = async (
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

const markShortTweet = (db: Database, tweetId: string) =>
  db
    .prepare(
      "UPDATE bookmarks SET primary_category = ?, primary_domain = ?, classification_confidence = 0.1 WHERE tweet_id = ?",
    )
    .run("meme-shitpost", "culture", tweetId);

const saveClassification = (
  db: Database,
  tweetId: string,
  result: ClassificationResult,
) =>
  db
    .prepare(`
    UPDATE bookmarks SET
      primary_category = ?,
      primary_domain = ?,
      classification_confidence = ?
    WHERE tweet_id = ?
  `)
    .run(
      result.primary_type,
      result.primary_domain,
      result.confidence,
      tweetId,
    );

const classifyRow = async (db: Database, llm: ConnectedLLM, row: Row): Promise<ClassifyResult> => {
  const content = row.article_text || row.text;

  if (!content || content.trim().length < 10) {
    markShortTweet(db, row.tweet_id);
    logger.info("short tweet — auto-classified as meme-shitpost", {
      tweet_id: row.tweet_id,
      text: content.slice(0, 60),
    });
    return "classified";
  }

  const result = await classifyWithLLM(llm, content, row.author_handle);
  saveClassification(db, row.tweet_id, result);
  logger.info("classified bookmark", {
    tweet_id: row.tweet_id,
    category: result.primary_type,
    domain: result.primary_domain,
    confidence: result.confidence,
  });

  // Rate limit between individual LLM calls
  await new Promise((r) => setTimeout(r, 200));
  return "classified";
};

const processRow = (db: Database, llm: ConnectedLLM, row: Row): Promise<ClassifyResult> =>
  classifyRow(db, llm, row).catch((err) => {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error("classify failed", { tweet_id: row.tweet_id, error: msg });
    return "failed" as const;
  });

const processBatch = (
  db: Database,
  llm: ConnectedLLM,
  batchNum: number,
  totalBatches: number,
  rows: Row[],
): Promise<ClassifyResult[]> => {
  logger.info("processing classification batch", {
    batch: batchNum,
    total: totalBatches,
    size: rows.length,
  });
  return Promise.all(rows.map((row) => processRow(db, llm, row)));
};

const summarize = (results: ClassifyResult[]) => {
  const counts = results.reduce(
    (acc, r) => ({ ...acc, [r]: (acc[r] || 0) + 1 }),
    {} as Record<ClassifyResult, number>,
  );
  return {
    classified: counts.classified || 0,
    failed: counts.failed || 0,
  };
};

export const runClassify = async (llm: ConnectedLLM, options: ClassifyOptions): Promise<void> => {
  logger.info("classify started", { model: llm.modelName() ?? "unknown" });

  const db = new Database(CONFIG.dbPath);
  db.exec("PRAGMA journal_mode=WAL");
  try {
    const rows = queryUnclassified(db, options.limit);
    logger.info("found unclassified bookmarks", { count: rows.length });

    if (rows.length === 0) {
      logger.info("all bookmarks already classified — nothing to do");
      return;
    }
    if (options.dryRun) return dryRunPreview(rows);

    const batches = chunk(rows, CONFIG.classificationBatchSize);
    const batchResults = await Promise.all(
      batches.map((batch, i) => processBatch(db, llm, i + 1, batches.length, batch)),
    );

    const { classified, failed } = summarize(batchResults.flat());
    logger.info("classify complete", { classified, failed, total: rows.length });
  } finally {
    db.close();
  }
};

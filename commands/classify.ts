// commands/classify.ts -- LLM classification via local Gemma (orchestrator)

import { Database } from "https://deno.land/x/sqlite3@0.12.0/mod.ts";
import { CONFIG } from "../config.ts";
import { logger } from "../utils/logger.ts";
import { type ConnectedLLM } from "../llm/index.ts";
import {
  type Row,
  queryUnclassified,
  dryRunPreview,
  markShortTweet,
  saveClassification,
} from "./classify-db.ts";
import {
  type ClassifyResult,
  classifyWithLLM,
} from "./classify-llm.ts";

interface ClassifyOptions {
  dryRun?: boolean;
  limit?: number;
}

const chunk = <T>(arr: T[], size: number): T[][] =>
  Array.from({ length: Math.ceil(arr.length / size) }, (_, i) =>
    arr.slice(i * size, i * size + size),
  );

const classifyRow = async (db: Database, llm: ConnectedLLM, row: Row): Promise<ClassifyResult> => {
  const content = row.clippings_text || row.article_text || row.text;

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

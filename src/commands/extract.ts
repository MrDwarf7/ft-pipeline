/** Extract articles via xtracticle + link to DB. */

import { closePipelineDb, getPipelineDb } from "../utils/db.ts";
import { logger } from "../utils/logger.ts";
import { queryPendingRows } from "./extract/db.ts";
import { processBatch, summarize } from "./extract/process.ts";
import type { BookmarkRow, ExtractOptions, ExtractResult } from "./extract/types.ts";

export type { BookmarkRow, ExtractOptions, ExtractResult } from "./extract/types.ts";
export {
  classifyTweet,
  extractArticleImages,
  extractArticleText,
  getEffectiveText,
  hasArticleBlocks,
  normalizeMedia,
} from "./extract/classify.ts";
export { buildClippingContent, buildFilename } from "./extract/clipping.ts";
export { fetchThread, getTweet } from "../extraction/xtracticle.ts";
export {
  parseXtracticleResponse,
  XtracticleResponseSchema,
  XtracticleTweetSchema,
} from "../extraction/xtracticle-schema.ts";

const BATCH_SIZE = 10;

const dryRunPreview = (rows: readonly BookmarkRow[]): void => {
  logger.info("dry run -- showing first 5 bookmarks to extract", {
    total: rows.length,
  });
  rows.slice(0, 5).forEach((row) =>
    logger.info(`  [${row.tweet_id}] ${row.text.slice(0, 80)}...`, {
      author: row.author_handle,
    })
  );
};

/** Slice rows into fixed-size batches for concurrent fetch windows. */
const toBatches = (
  rows: readonly BookmarkRow[],
  batchSize: number,
): BookmarkRow[][] => {
  const batchCount = Math.ceil(rows.length / batchSize);
  return Array.from({ length: batchCount }, (_, batchIndex) => {
    const start = batchIndex * batchSize;
    return rows.slice(start, start + batchSize);
  });
};

/**
 * Run extract: query pending bookmarks, fetch xtracticle, write clippings, update DB.
 * Batches are processed sequentially; items within a batch are concurrent.
 */
export const runExtract = async (options: ExtractOptions): Promise<void> => {
  logger.info("extract started");

  const db = getPipelineDb();

  try {
    const rows = queryPendingRows(db, options.limit);
    const skipExisting = options.skipExisting === true;
    logger.info("found bookmarks to extract", {
      count: rows.length,
      limit: options.limit ?? "none",
      skipExisting,
    });

    if (options.dryRun === true) {
      dryRunPreview(rows);
      return;
    }

    const batches = toBatches(rows, BATCH_SIZE);

    const allResults = await batches.reduce<Promise<ExtractResult[]>>(
      (chain, batch, i) =>
        chain.then(async (acc) => {
          logger.info("extract batch processing", {
            batch: i + 1,
            total: batches.length,
            size: batch.length,
          });
          const results = await processBatch(db, batch, skipExisting);
          return [...acc, ...results];
        }),
      Promise.resolve([]),
    );

    const { extracted, skipped, failed } = summarize(allResults);
    logger.info("extract complete", {
      extracted,
      skipped,
      failed,
      total: rows.length,
    });
  } finally {
    closePipelineDb();
  }
};

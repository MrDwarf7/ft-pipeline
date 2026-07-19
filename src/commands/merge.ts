/** Merge Clippings enriched text back into DB */
import { CONFIG } from "../config.ts";
import { logger } from "../utils/logger.ts";
import { closePipelineDb, getPipelineDb } from "../utils/db.ts";
import { extractBody, parseFrontmatter } from "../utils/frontmatter.ts";

interface MergeOptions {
  dryRun?: boolean;
}

interface ClippingEntry {
  body: string;
  type: string;
}

/** Rank for clipping type priority: article > post > media. Higher wins.
 *  Accepts extract singular labels and legacy plural labels.
 */
export const clippingTypeRank = (type: string): number => {
  if (type === "article" || type === "articles") return 3;
  if (type === "post" || type === "posts") return 2;
  if (type === "media") return 1;
  return 0;
};

/** True when the candidate clipping should replace an existing one. */
export const shouldPreferClipping = (
  existingType: string | undefined,
  candidateType: string,
): boolean => {
  if (existingType === undefined) return true;
  return clippingTypeRank(candidateType) > clippingTypeRank(existingType);
};

const readClippings = async (): Promise<Map<string, ClippingEntry>> => {
  const clippings = new Map<string, ClippingEntry>();

  // Iterate over types and dirs functionally using Object.entries()
  const _typeDirs = Object.entries(CONFIG.clippingDirs);
  const entries = await Array.fromAsync(
    Deno.readDir(CONFIG.clippingsBase),
  ).then((entries) => entries.filter((e) => e.isFile && e.name.endsWith(".md")));

  const fileResults = await Promise.all(
    entries.map(async (e): Promise<ClippingEntry | null> => {
      try {
        const content = await Deno.readTextFile(`${CONFIG.clippingsBase}/${e.name}`);
        const fm = parseFrontmatter(content);
        const tweetId = fm.tweet_id;
        if (!tweetId) return null;

        const body = extractBody(content);
        if (!body || body.trim().length === 0) return null;

        // Priority: article > post > media (richest content wins)
        const type = fm.type ?? "post";
        const existing = clippings.get(tweetId);

        if (shouldPreferClipping(existing?.type, type)) {
          clippings.set(tweetId, {
            body: body.slice(0, 5000), // Cap at 5000 chars
            type,
          });
        }
        return null;
      } catch (err) {
        // Dir doesn't exist -- skip silently
        if (err instanceof Deno.errors.NotFound) return null;
        logger.warn("failed to read clippings dir", {
          dir: CONFIG.clippingsBase,
          error: String(err),
        });
        return null;
      }
    }),
  );
  fileResults.filter(Boolean);

  return clippings;
};

export const runMerge = async (options: MergeOptions = {}): Promise<void> => {
  logger.info("merge started");

  const clippings = await readClippings();
  logger.info("read clippings", { count: clippings.size });

  if (clippings.size === 0) {
    logger.info("no clippings found -- nothing to merge");
    return;
  }

  if (options.dryRun) {
    // Show stats
    const typeCounts = [...clippings.values()].reduce(
      (acc, c) => ({ ...acc, [c.type]: (acc[c.type] || 0) + 1 }),
      {} as Record<string, number>,
    );
    logger.info("dry run -- merge preview", {
      total: clippings.size,
      byType: typeCounts,
    });
    return;
  }

  const db = getPipelineDb();

  try {
    // Find which tweet_ids exist in the DB
    const dbIds = new Set(
      db
        .prepare("SELECT tweet_id FROM bookmarks")
        .all<{ tweet_id: string }>()
        .map((r) => r.tweet_id),
    );

    let merged = 0;
    const skipped = 0;
    const now = new Date().toISOString();

    const stmt = db.prepare(`
      UPDATE bookmarks SET
        clippings_text = ?,
        clippings_type = ?,
        clippings_merged_at = ?
      WHERE tweet_id = ?
        AND (clippings_text IS NULL OR clippings_merged_at IS NULL)
    `);

    // Process clippings functionally - filter and map operations
    const validClippings = Array.from(clippings.entries()).filter(([tweetId]) =>
      dbIds.has(tweetId)
    );

    // Sequentially update each matching clipping
    const updatePromises = validClippings.map(([tweetId, entry]) => {
      stmt.run(entry.body, entry.type, now, tweetId);
      merged++;
      return Promise.resolve();
    });

    await Promise.all(updatePromises);

    logger.info("merge complete", { merged, skipped, total: clippings.size });

    // Log enrichment stats
    const enrichedCount = db
      .prepare(
        "SELECT COUNT(*) as cnt FROM bookmarks WHERE clippings_text IS NOT NULL",
      )
      .all<{ cnt: number }>();
    logger.info("DB enrichment status", {
      totalEnriched: enrichedCount?.[0]?.cnt ?? 0,
    });
  } finally {
    closePipelineDb();
  }
};

// commands/merge.ts -- Merge Clippings enriched text back into DB
//
// Reads .md files from Clippings/{X-Articles, X-Posts, X-Media}/,
// extracts frontmatter tweet_id + body text, matches against bookmarks,
// and writes clippings_text (capped at 5000 chars) + clippings_type + timestamp.
// Priority: articles > posts > media (richest content wins).

import { Database } from "https://deno.land/x/sqlite3@0.12.0/mod.ts";
import { CONFIG } from "../config.ts";
import { logger } from "../utils/logger.ts";
import { extractBody, parseFrontmatter } from "../utils/frontmatter.ts";

interface MergeOptions {
  dryRun?: boolean;
}

interface ClippingEntry {
  body: string;
  type: string;
}

const TYPE_RANK: Record<string, number> = {
  articles: 3,
  posts: 2,
  media: 1,
};

/** Read all clipping files from the three dirs, keyed by tweet_id */
const readClippings = async (): Promise<Map<string, ClippingEntry>> => {
  const clippings = new Map<string, ClippingEntry>();

  for (const [type, dir] of Object.entries(CONFIG.clippingDirs)) {
    const dirPath = `${CONFIG.clippingsBase}/${dir}`;
    try {
      for await (const entry of Deno.readDir(dirPath)) {
        if (!entry.isFile || !entry.name.endsWith(".md")) continue;

        const content = await Deno.readTextFile(`${dirPath}/${entry.name}`);
        const fm = parseFrontmatter(content);
        const tweetId = fm.tweet_id;
        if (!tweetId) continue;

        const body = extractBody(content);
        if (!body || body.trim().length === 0) continue;

        // Priority: articles > posts > media (richest content wins)
        const existing = clippings.get(tweetId);
        const newRank = TYPE_RANK[type] || 0;
        const existingRank = existing ? (TYPE_RANK[existing.type] || 0) : 0;

        if (!existing || newRank > existingRank) {
          clippings.set(tweetId, {
            body: body.slice(0, 5000), // Cap at 5000 chars
            type,
          });
        }
      }
    } catch (err) {
      // Dir doesn't exist — skip silently
      if (err instanceof Deno.errors.NotFound) continue;
      logger.warn("failed to read clippings dir", { dir: dirPath, error: String(err) });
    }
  }

  return clippings;
};

export const runMerge = async (options: MergeOptions = {}): Promise<void> => {
  logger.info("merge started");

  const clippings = await readClippings();
  logger.info("read clippings", { count: clippings.size });

  if (clippings.size === 0) {
    logger.info("no clippings found — nothing to merge");
    return;
  }

  if (options.dryRun) {
    // Show stats
    const typeCounts = [...clippings.values()].reduce(
      (acc, c) => ({ ...acc, [c.type]: (acc[c.type] || 0) + 1 }),
      {} as Record<string, number>,
    );
    logger.info("dry run — merge preview", { total: clippings.size, byType: typeCounts });
    return;
  }

  const db = new Database(CONFIG.pipelineDbPath);
  db.exec("PRAGMA journal_mode=WAL");
  try {
    // Find which tweet_ids exist in the DB
    const dbIds = new Set(
      db.prepare("SELECT tweet_id FROM bookmarks").all<{ tweet_id: string }>().map((r) =>
        r.tweet_id
      ),
    );

    let merged = 0;
    let skipped = 0;
    const now = new Date().toISOString();

    // Use a transaction for bulk updates
    db.exec("BEGIN");
    try {
      const stmt = db.prepare(`
        UPDATE bookmarks SET
          clippings_text = ?,
          clippings_type = ?,
          clippings_merged_at = ?
        WHERE tweet_id = ?
          AND (clippings_text IS NULL OR clippings_merged_at IS NULL)
      `);

      for (const [tweetId, entry] of clippings) {
        if (!dbIds.has(tweetId)) {
          skipped++;
          continue;
        }

        stmt.run(entry.body, entry.type, now, tweetId);
        merged++;
      }

      db.exec("COMMIT");
    } catch (err) {
      db.exec("ROLLBACK");
      throw err;
    }

    logger.info("merge complete", { merged, skipped, total: clippings.size });

    // Log enrichment stats
    const enrichedCount = db
      .prepare("SELECT COUNT(*) as cnt FROM bookmarks WHERE clippings_text IS NOT NULL")
      .all<{ cnt: number }>();
    logger.info("DB enrichment status", { totalEnriched: enrichedCount?.[0]?.cnt ?? 0 });
  } finally {
    db.close();
  }
};

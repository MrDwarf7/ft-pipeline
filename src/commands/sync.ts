// commands/sync.ts -- Sync bookmarks from X via ft CLI, then import into our DB
//
// We run ft CLI sync to update ~/.ft-bookmarks/bookmarks.db (ft's DB),
// then COPY new/updated bookmarks into our own pipeline.db.

import { Database } from "jsr:@db/sqlite@^0.13.0";
import { CONFIG } from "../config.ts";
import { checkCookies, getCookies } from "./cookies.ts";
import { logger } from "../utils/logger.ts";

interface SyncOptions {
  maxPages?: number;
  targetAdds?: number;
  maxMinutes?: number;
  rebuild?: boolean;
  continue?: boolean;
  gaps?: boolean;
}

/** Copy bookmarks from ft's DB into our pipeline DB */
const importFromFtDb = (): { imported: number; updated: number } => {
  const ftDb = new Database(CONFIG.ftDbPath);
  const pipelineDb = new Database(CONFIG.pipelineDbPath);
  pipelineDb.exec("PRAGMA journal_mode=WAL");

  try {
    // Read all bookmarks from ft's DB
    const ftRows = ftDb.prepare(`
      SELECT tweet_id, url, text, author_handle, author_name, posted_at,
             links_json, COALESCE(media_count, 0) as media_count
      FROM bookmarks
      ORDER BY posted_at DESC
    `).all<{
      tweet_id: string;
      url: string;
      text: string;
      author_handle: string;
      author_name: string;
      posted_at: string;
      links_json: string | null;
      media_count: number;
    }>();

    // Upsert into our DB
    const stmt = pipelineDb.prepare(`
      INSERT INTO bookmarks (tweet_id, url, text, author_handle, author_name, posted_at, links_json, media_count, synced_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(tweet_id) DO UPDATE SET
        url = excluded.url,
        text = excluded.text,
        author_handle = excluded.author_handle,
        author_name = excluded.author_name,
        posted_at = excluded.posted_at,
        links_json = excluded.links_json,
        media_count = excluded.media_count,
        synced_at = excluded.synced_at
    `);

    const now = new Date().toISOString();
    const imported = ftRows.length;

    pipelineDb.exec("BEGIN");
    try {
      ftRows.forEach((row: (typeof ftRows)[0]) =>
        stmt.run(
          row.tweet_id,
          row.url,
          row.text,
          row.author_handle,
          row.author_name,
          row.posted_at,
          row.links_json,
          row.media_count,
          now,
        )
      );
      pipelineDb.exec("COMMIT");
    } catch (err) {
      pipelineDb.exec("ROLLBACK");
      throw err;
    }

    ftDb.close();
    pipelineDb.close();
    return { imported, updated: 0 };
  } catch (err) {
    ftDb.close();
    pipelineDb.close();
    throw err;
  }
};

export const runSync = async (
  password: string | undefined,
  options: SyncOptions,
): Promise<void> => {
  logger.info("sync started");

  const hasCookies = await checkCookies();
  if (!hasCookies) {
    throw new Error("No cookies file. Run: ft-pipeline cookies extract");
  }

  if (!password) {
    throw new Error("Password required (use --password or FT_PIPELINE_PASSWORD env)");
  }

  logger.info("decrypting X session cookies");
  const cookies = await getCookies(password);

  const args = ["start", "sync", "--cookies", cookies.ct0, cookies.authToken, "--yes"];

  if (options.maxPages) args.push("--max-pages", String(options.maxPages));
  if (options.targetAdds) args.push("--target-adds", String(options.targetAdds));
  if (options.maxMinutes) args.push("--max-minutes", String(options.maxMinutes));
  if (options.rebuild) args.push("--rebuild");
  if (options.continue) args.push("--continue");
  if (options.gaps) args.push("--gaps");

  logger.info("running ft CLI sync", {
    maxPages: options.maxPages ?? "none",
    targetAdds: options.targetAdds ?? "none",
    maxMinutes: options.maxMinutes ?? "none",
    rebuild: options.rebuild ?? false,
  });

  const ftDir = `${Deno.env.get("HOME")}/Documents/GitHub_Projects/JavaScript/fieldtheory-cli`;
  const cmd = new Deno.Command("pnpm", {
    args,
    cwd: ftDir,
    stdout: "inherit",
    stderr: "inherit",
  });

  const result = await cmd.output();
  if (!result.success) {
    throw new Error(`ft sync failed (exit ${result.code})`);
  }

  logger.info("ft CLI sync complete — importing into pipeline DB");
  const { imported } = importFromFtDb();
  logger.info("import complete", { imported });
};

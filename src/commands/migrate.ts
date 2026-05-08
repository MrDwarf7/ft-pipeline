// commands/migrate.ts -- Create/migrate our own pipeline database
//
// We own pipeline.db in /home/dwarf/.config/ft-pipeline/.

import { CONFIG } from "../config.ts";
import { logger } from "../utils/logger.ts";
import { closePipelineDb, getPipelineDb } from "../utils/db.ts";

export const runMigrate = (): void => {
  logger.info("migrate started", { db: CONFIG.pipelineDbPath });

  const db = getPipelineDb();

  // Check if bookmarks table exists with wrong schema (e.g. ft's 46 columns)
  const existingCols = db.prepare("PRAGMA table_info(bookmarks)").all();
  if (existingCols.length > 0 && existingCols.length !== 21) {
    logger.warn("bookmarks table has wrong schema, dropping and recreating", {
      current_columns: existingCols.length,
      expected: 21,
    });
    db.exec("DROP TABLE IF EXISTS bookmarks");
  }

  // Migration: add extract_status if missing (20 → 21 columns)
  if (
    existingCols.length === 20 &&
    !existingCols.some(
      (c: Record<string, unknown>) => c.name === "extract_status",
    )
  ) {
    logger.info("migrating: adding extract_status column");
    db.exec("ALTER TABLE bookmarks ADD COLUMN extract_status TEXT");
  }

  // Main bookmarks table — everything we need, nothing we don't
  db.exec(`
    CREATE TABLE IF NOT EXISTS bookmarks (
      tweet_id          TEXT PRIMARY KEY,
      url               TEXT,
      text              TEXT,
      author_handle     TEXT,
      author_name       TEXT,
      posted_at         TEXT,
      links_json        TEXT,
      media_count       INTEGER DEFAULT 0,

      -- Extraction status
      clipping_path     TEXT,
      content_type      TEXT,        -- 'article' | 'post' | 'media'
      extract_status    TEXT,        -- 'extracted' | 'empty' | '404' | 'no_tweets' | 'error'

      -- Enrichment from clippings
      clippings_text    TEXT,
      clippings_type    TEXT,
      clippings_merged_at TEXT,

      -- Classification results
      primary_type      TEXT,
      primary_domain    TEXT,
      types             TEXT,        -- JSON array
      domains           TEXT,        -- JSON array
      confidence        REAL,
      classified_at     TEXT,

      -- Sync metadata
      synced_at         TEXT
    )
  `);

  // Indexes for common queries
  db.exec(
    `CREATE INDEX IF NOT EXISTS idx_bookmarks_primary_type ON bookmarks(primary_type)`,
  );
  db.exec(
    `CREATE INDEX IF NOT EXISTS idx_bookmarks_primary_domain ON bookmarks(primary_domain)`,
  );
  db.exec(
    `CREATE INDEX IF NOT EXISTS idx_bookmarks_clipping_path ON bookmarks(clipping_path)`,
  );

  // Migration runs table — track what we've done
  db.exec(`
    CREATE TABLE IF NOT EXISTS migration_runs (
      id        INTEGER PRIMARY KEY AUTOINCREMENT,
      name      TEXT NOT NULL,
      ran_at    TEXT NOT NULL DEFAULT (datetime('now')),
      stats     TEXT  -- JSON with counts, etc.
    )
  `);

  closePipelineDb();
  logger.info("migrate complete");
};

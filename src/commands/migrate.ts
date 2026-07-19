/** Create/migrate our own pipeline database.
 *  Additive only: never drops bookmarks. Applied set lives in migration_runs.
 */
import { CONFIG } from "../config.ts";
import { logger } from "../utils/logger.ts";
import { closePipelineDb, type Database, getPipelineDb } from "../utils/db.ts";

/** Full bookmarks schema for fresh DBs. Existing tables are left intact. */
const BOOKMARKS_DDL = `
CREATE TABLE IF NOT EXISTS bookmarks (
  tweet_id          TEXT PRIMARY KEY,
  url               TEXT,
  text              TEXT,
  author_handle     TEXT,
  author_name       TEXT,
  posted_at         TEXT,
  links_json        TEXT,
  media_count       INTEGER DEFAULT 0,

  clipping_path     TEXT,
  content_type      TEXT,
  extract_status    TEXT,

  clippings_text    TEXT,
  clippings_type    TEXT,
  clippings_merged_at TEXT,

  primary_type      TEXT,
  primary_domain    TEXT,
  types             TEXT,
  domains           TEXT,
  confidence        REAL,
  classified_at     TEXT,

  synced_at         TEXT
)
`;

const MIGRATION_RUNS_DDL = `
CREATE TABLE IF NOT EXISTS migration_runs (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  name      TEXT NOT NULL,
  ran_at    TEXT NOT NULL DEFAULT (datetime('now')),
  stats     TEXT
)
`;

const INDEX_DDL: readonly string[] = [
  `CREATE INDEX IF NOT EXISTS idx_bookmarks_primary_type ON bookmarks(primary_type)`,
  `CREATE INDEX IF NOT EXISTS idx_bookmarks_primary_domain ON bookmarks(primary_domain)`,
  `CREATE INDEX IF NOT EXISTS idx_bookmarks_clipping_path ON bookmarks(clipping_path)`,
];

/** Named additive migration. Apply must be safe when the change is already present. */
interface Migration {
  readonly name: string;
  readonly apply: (db: Database, columns: ReadonlySet<string>) => Record<string, unknown>;
}

/** Column names currently on bookmarks (empty when the table does not exist). */
const readBookmarkColumns = (db: Database): ReadonlySet<string> => {
  const names = db
    .prepare("PRAGMA table_info(bookmarks)")
    .all()
    .flatMap((row) => {
      const name = row["name"];
      return typeof name === "string" ? [name] : [];
    });
  return new Set(names);
};

/** Names already recorded in the migration ledger. */
const readAppliedMigrations = (db: Database): ReadonlySet<string> => {
  const names = db
    .prepare("SELECT name FROM migration_runs")
    .all()
    .flatMap((row) => {
      const name = row["name"];
      return typeof name === "string" ? [name] : [];
    });
  return new Set(names);
};

const recordMigration = (
  db: Database,
  name: string,
  stats: Record<string, unknown>,
): void => {
  db.prepare("INSERT INTO migration_runs (name, stats) VALUES (?, ?)").run(
    name,
    JSON.stringify(stats),
  );
};

/** Add a column only when PRAGMA shows it is missing. */
const addColumnIfMissing = (
  db: Database,
  columns: ReadonlySet<string>,
  column: string,
  sqlType: string,
): Record<string, unknown> => {
  if (columns.has(column)) {
    return { action: "skip", reason: "column_exists", column };
  }
  db.exec(`ALTER TABLE bookmarks ADD COLUMN ${column} ${sqlType}`);
  return { action: "added", column, sqlType };
};

/**
 * Ordered additive migrations. Fresh CREATE already includes these columns;
 * migrations only upgrade older DBs. Never DROP.
 */
const MIGRATIONS: readonly Migration[] = [
  {
    name: "add_extract_status",
    apply: (db, columns) => addColumnIfMissing(db, columns, "extract_status", "TEXT"),
  },
];

const ensureBaseSchema = (db: Database): void => {
  db.exec(MIGRATION_RUNS_DDL);
  db.exec(BOOKMARKS_DDL);
  INDEX_DDL.forEach((sql) => db.exec(sql));
};

const runAdditiveMigrations = (db: Database): void => {
  const applied = readAppliedMigrations(db);

  MIGRATIONS.forEach((migration) => {
    if (applied.has(migration.name)) {
      logger.info("migration already applied", { name: migration.name });
      return;
    }

    // Re-read columns each step so earlier ADDs are visible to later ones.
    const columns = readBookmarkColumns(db);
    const stats = migration.apply(db, columns);
    recordMigration(db, migration.name, stats);
    logger.info("migration applied", { name: migration.name, stats });
  });
};

export const runMigrate = (): void => {
  logger.info("migrate started", { db: CONFIG.pipelineDbPath });

  const db = getPipelineDb();
  ensureBaseSchema(db);
  runAdditiveMigrations(db);

  closePipelineDb();
  logger.info("migrate complete");
};

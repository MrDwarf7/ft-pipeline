/** Pipeline DB via Deno's built-in `node:sqlite` (DatabaseSync).
 *
 * No host `sqlite3` CLI. Compiles into a self-contained binary without
 * `--allow-run=sqlite3`. Same helper surface as the old CLI wrapper.
 */
import { DatabaseSync } from "node:sqlite";

import { CONFIG } from "../config.ts";
import { logger } from "./logger.ts";

/** Bound SQL value: string, number, or null. */
export type SqlValue = string | number | null;

/** Row map for insert/update/select helpers. Keys are column names. */
export type Row = Record<string, SqlValue>;

/** Options for select / selectOne helpers. */
export interface SelectOpts {
  readonly columns: readonly string[];
  /** Equality AND predicates. Values are bound. */
  readonly where?: Row;
  /** Trusted identifier (optional ASC/DESC). Not user input. */
  readonly orderBy?: string;
  readonly limit?: number;
}

export interface Statement {
  /** Run a non-query statement with positional binds. */
  run(...params: SqlValue[]): void;
  /**
   * Run a query; returns untyped JSON rows. Empty success -> [].
   * Callers must validate with zod (see parseRows in db-rows.ts) -- no generic cast.
   */
  all(...params: SqlValue[]): Record<string, unknown>[];
}

export interface Database {
  /** Run trusted SQL with no result set (DDL / multi-statement). */
  exec(sql: string): void;
  prepare(sql: string): Statement;
  /** Run writes in one connection under BEGIN/COMMIT. */
  transaction(fn: (db: Database) => void): void;
  close(): void;

  insert(table: string, row: Row): void;
  upsert(table: string, row: Row, conflictColumns: readonly string[]): void;
  /** Equality AND where. Throws if where is empty. */
  update(table: string, set: Row, where: Row): void;
  select(table: string, opts: SelectOpts): Record<string, unknown>[];
  selectOne(table: string, opts: SelectOpts): Record<string, unknown> | null;
}

/** Table/column names we generate; reject anything that is not an identifier. */
const assertIdent = (name: string): string => {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) {
    throw new Error(`invalid SQL identifier: ${name}`);
  }
  return name;
};

/** Trusted orderBy: identifier with optional ASC/DESC. */
const assertOrderBy = (orderBy: string): string => {
  if (!/^[A-Za-z_][A-Za-z0-9_]*(\s+(ASC|DESC))?$/i.test(orderBy)) {
    throw new Error(`invalid orderBy: ${orderBy}`);
  }
  return orderBy;
};

/** Normalize node:sqlite rows (null-prototype objects) to plain records. */
const asRow = (row: unknown): Record<string, unknown> => {
  if (row === null || typeof row !== "object" || Array.isArray(row)) {
    throw new Error(`sqlite: expected object row, got ${typeof row}`);
  }
  return { ...(row as Record<string, unknown>) };
};

const asRows = (rows: unknown): Record<string, unknown>[] => {
  if (!Array.isArray(rows)) {
    throw new Error(`sqlite: expected row array, got ${typeof rows}`);
  }
  return rows.map(asRow);
};

const wrapError = (err: unknown, context: string): Error => {
  const msg = err instanceof Error ? err.message : String(err);
  return new Error(`sqlite error (${context}): ${msg}`);
};

interface PreparedSql {
  readonly sql: string;
  readonly params: readonly SqlValue[];
}

const buildInsert = (table: string, row: Row): PreparedSql => {
  const cols = Object.keys(row);
  if (cols.length === 0) throw new Error("insert: row has no columns");
  const t = assertIdent(table);
  const colList = cols.map(assertIdent).join(", ");
  const placeholders = cols.map(() => "?").join(", ");
  return {
    sql: `INSERT INTO ${t} (${colList}) VALUES (${placeholders})`,
    params: cols.map((c) => row[c] ?? null),
  };
};

const buildUpsert = (
  table: string,
  row: Row,
  conflictColumns: readonly string[],
): PreparedSql => {
  const cols = Object.keys(row);
  if (cols.length === 0) throw new Error("upsert: row has no columns");
  if (conflictColumns.length === 0) {
    throw new Error("upsert: conflictColumns is empty");
  }
  const t = assertIdent(table);
  const colList = cols.map(assertIdent).join(", ");
  const placeholders = cols.map(() => "?").join(", ");
  const conflict = conflictColumns.map(assertIdent).join(", ");
  const conflictSet = new Set(conflictColumns);
  const updateCols = cols.filter((c) => !conflictSet.has(c));
  const params = cols.map((c) => row[c] ?? null);
  if (updateCols.length === 0) {
    return {
      sql:
        `INSERT INTO ${t} (${colList}) VALUES (${placeholders}) ON CONFLICT(${conflict}) DO NOTHING`,
      params,
    };
  }
  const setClause = updateCols
    .map((c) => `${assertIdent(c)} = excluded.${assertIdent(c)}`)
    .join(", ");
  return {
    sql:
      `INSERT INTO ${t} (${colList}) VALUES (${placeholders}) ON CONFLICT(${conflict}) DO UPDATE SET ${setClause}`,
    params,
  };
};

const buildUpdate = (table: string, set: Row, where: Row): PreparedSql => {
  const setCols = Object.keys(set);
  const whereCols = Object.keys(where);
  if (setCols.length === 0) throw new Error("update: set is empty");
  if (whereCols.length === 0) throw new Error("update: where is empty");
  const t = assertIdent(table);
  const setClause = setCols.map((c) => `${assertIdent(c)} = ?`).join(", ");
  const whereClause = whereCols.map((c) => `${assertIdent(c)} = ?`).join(" AND ");
  return {
    sql: `UPDATE ${t} SET ${setClause} WHERE ${whereClause}`,
    params: [
      ...setCols.map((c) => set[c] ?? null),
      ...whereCols.map((c) => where[c] ?? null),
    ],
  };
};

const buildSelect = (table: string, opts: SelectOpts): PreparedSql => {
  if (opts.columns.length === 0) throw new Error("select: columns is empty");
  const t = assertIdent(table);
  const colList = opts.columns.map(assertIdent).join(", ");
  let sql = `SELECT ${colList} FROM ${t}`;
  const whereCols = opts.where === undefined ? [] : Object.keys(opts.where);
  const whereParams: SqlValue[] = whereCols.map((c) => {
    const where = opts.where;
    if (where === undefined) return null;
    return where[c] ?? null;
  });
  if (whereCols.length > 0) {
    sql += ` WHERE ${whereCols.map((c) => `${assertIdent(c)} = ?`).join(" AND ")}`;
  }
  if (opts.orderBy !== undefined) {
    sql += ` ORDER BY ${assertOrderBy(opts.orderBy)}`;
  }
  const limitParams: SqlValue[] = opts.limit === undefined ? [] : [opts.limit];
  if (opts.limit !== undefined) {
    sql += ` LIMIT ?`;
  }
  return { sql, params: [...whereParams, ...limitParams] };
};

class NodeSqliteStatement implements Statement {
  private readonly stmt: ReturnType<DatabaseSync["prepare"]>;

  constructor(stmt: ReturnType<DatabaseSync["prepare"]>) {
    this.stmt = stmt;
  }

  run(...params: SqlValue[]): void {
    try {
      this.stmt.run(...params);
    } catch (err) {
      throw wrapError(err, "run");
    }
  }

  all(...params: SqlValue[]): Record<string, unknown>[] {
    try {
      return asRows(this.stmt.all(...params));
    } catch (err) {
      throw wrapError(err, "all");
    }
  }
}

class NodeSqliteDatabase implements Database {
  private readonly raw: DatabaseSync;
  private readonly path: string;
  private closed = false;

  constructor(dbPath: string) {
    this.path = dbPath;
    try {
      this.raw = new DatabaseSync(dbPath);
    } catch (err) {
      throw wrapError(err, "open");
    }
  }

  exec(sql: string): void {
    try {
      this.raw.exec(sql);
    } catch (err) {
      throw wrapError(err, "exec");
    }
  }

  prepare(sql: string): Statement {
    try {
      return new NodeSqliteStatement(this.raw.prepare(sql));
    } catch (err) {
      throw wrapError(err, "prepare");
    }
  }

  transaction(fn: (db: Database) => void): void {
    this.exec("BEGIN IMMEDIATE");
    try {
      fn(this);
      this.exec("COMMIT");
    } catch (err) {
      try {
        this.exec("ROLLBACK");
      } catch (rollbackErr) {
        logger.warn("sqlite rollback failed", {
          error: rollbackErr instanceof Error ? rollbackErr.message : String(rollbackErr),
        });
      }
      throw err;
    }
  }

  close(): void {
    if (this.closed) return;
    try {
      this.raw.close();
    } catch (err) {
      logger.warn("sqlite close failed", {
        path: this.path,
        error: err instanceof Error ? err.message : String(err),
      });
    }
    this.closed = true;
    logger.info("DB connection closed", { path: this.path });
  }

  insert(table: string, row: Row): void {
    const { sql, params } = buildInsert(table, row);
    this.prepare(sql).run(...params);
  }

  upsert(table: string, row: Row, conflictColumns: readonly string[]): void {
    const { sql, params } = buildUpsert(table, row, conflictColumns);
    this.prepare(sql).run(...params);
  }

  update(table: string, set: Row, where: Row): void {
    const { sql, params } = buildUpdate(table, set, where);
    this.prepare(sql).run(...params);
  }

  select(table: string, opts: SelectOpts): Record<string, unknown>[] {
    const { sql, params } = buildSelect(table, opts);
    return this.prepare(sql).all(...params);
  }

  selectOne(table: string, opts: SelectOpts): Record<string, unknown> | null {
    const rows = this.select(table, {
      columns: opts.columns,
      where: opts.where,
      orderBy: opts.orderBy,
      limit: 1,
    });
    const first = rows[0];
    return first === undefined ? null : first;
  }
}

/** Open a Database for an arbitrary file path (tests and non-singleton use). */
export const openDatabase = (dbPath: string): Database => {
  return new NodeSqliteDatabase(dbPath);
};

let dbInstance: Database | null = null;

/** Singleton pipeline.db under CONFIG.pipelineDbPath. */
export const getPipelineDb = (): Database => {
  if (!dbInstance) {
    dbInstance = new NodeSqliteDatabase(CONFIG.pipelineDbPath);
  }
  return dbInstance;
};

/** Close and drop the singleton handle. */
export const closePipelineDb = (): void => {
  if (dbInstance !== null) {
    dbInstance.close();
  }
  dbInstance = null;
};

export type { Database as DatabaseType };

/** Pipeline DB via sqlite3 CLI. Bound params, table helpers, fail-loud queries. */

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
  /** Run writes in one sqlite3 process under BEGIN/COMMIT. */
  transaction(fn: (db: Database) => void): void;
  close(): void;

  insert(table: string, row: Row): void;
  upsert(table: string, row: Row, conflictColumns: readonly string[]): void;
  /** Equality AND where. Throws if where is empty. */
  update(table: string, set: Row, where: Row): void;
  select(table: string, opts: SelectOpts): Record<string, unknown>[];
  selectOne(table: string, opts: SelectOpts): Record<string, unknown> | null;
}

/** Encode a bind value for `.parameter set ?N <value>`. */
const encodeParamValue = (val: SqlValue): string => {
  if (val === null) return "null";
  if (typeof val === "number") {
    if (!Number.isFinite(val)) {
      throw new Error(`sqlite3 bind: non-finite number ${val}`);
    }
    return String(val);
  }
  /* SQL string literal, protected as one double-quoted dot-command arg.
   * Docs: wrap text as "'...'" so evaluation yields TEXT (not bare null). */
  const sqlLiteral = `'${val.replaceAll("'", "''")}'`;
  const cEscaped = sqlLiteral
    .replaceAll("\\", "\\\\")
    .replaceAll('"', '\\"')
    .replaceAll("\n", "\\n")
    .replaceAll("\r", "\\r")
    .replaceAll("\t", "\\t");
  return `"${cEscaped}"`;
};

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

/** Build argv fragments: .parameter init/set then the SQL. */
const bindArgs = (sql: string, params: readonly SqlValue[]): string[] => {
  if (params.length === 0) return [sql];
  const sets = params.map((p, i) => `.parameter set ?${i + 1} ${encodeParamValue(p)}`);
  return [".parameter init", ...sets, sql];
};

/** Run sqlite3 CLI; returns decoded stdout/stderr and exit code. */
const sqlite3 = (
  dbPath: string,
  args: readonly string[],
): { stdout: string; stderr: string; code: number } => {
  const { code, stdout, stderr } = new Deno.Command("sqlite3", {
    args: [dbPath, ...args],
    stdout: "piped",
    stderr: "piped",
  }).outputSync();
  return {
    stdout: new TextDecoder().decode(stdout).trim(),
    stderr: new TextDecoder().decode(stderr).trim(),
    code,
  };
};

/** Execute SQL (optional binds). Nonzero exit throws with stderr. */
const execSql = (
  dbPath: string,
  sql: string,
  params: readonly SqlValue[],
): void => {
  const { stderr, code } = sqlite3(dbPath, bindArgs(sql, params));
  if (code !== 0) {
    throw new Error(`sqlite3 error (code ${code}): ${stderr || "(no stderr)"}`);
  }
};

/** Query with .mode json. Empty stdout -> []. Bad JSON or nonzero -> throw. */
const querySql = (
  dbPath: string,
  sql: string,
  params: readonly SqlValue[],
): Record<string, unknown>[] => {
  const { stdout, stderr, code } = sqlite3(dbPath, [
    ".mode json",
    ...bindArgs(sql, params),
  ]);
  if (code !== 0) {
    throw new Error(`sqlite3 error (code ${code}): ${stderr || "(no stderr)"}`);
  }
  if (!stdout) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(stdout);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(
      `sqlite3 JSON parse failed: ${msg}; stdout=${stdout.slice(0, 200)}`,
    );
  }
  const asRow = (row: unknown): Record<string, unknown> => {
    if (row === null || typeof row !== "object" || Array.isArray(row)) {
      throw new Error(`sqlite3 JSON: expected object row, got ${typeof row}`);
    }
    return row as Record<string, unknown>;
  };
  if (Array.isArray(parsed)) {
    return parsed.map(asRow);
  }
  if (parsed !== null && typeof parsed === "object") {
    return [asRow(parsed)];
  }
  throw new Error(`sqlite3 JSON: expected array or object, got ${typeof parsed}`);
};

/** Run a multi-command script (transaction batch) in one process. */
const runScript = (dbPath: string, commands: readonly string[]): void => {
  const { stderr, code } = sqlite3(dbPath, [".bail on", ...commands]);
  if (code !== 0) {
    throw new Error(`sqlite3 error (code ${code}): ${stderr || "(no stderr)"}`);
  }
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

class Sqlite3Statement implements Statement {
  private readonly dbPath: string;
  private readonly sql: string;

  constructor(dbPath: string, sql: string) {
    this.dbPath = dbPath;
    this.sql = sql;
  }

  run(...params: SqlValue[]): void {
    execSql(this.dbPath, this.sql, params);
  }

  all(...params: SqlValue[]): Record<string, unknown>[] {
    return querySql(this.dbPath, this.sql, params);
  }
}

/** Statement that appends bound SQL to a transaction command list. */
class TxStatement implements Statement {
  private readonly commands: string[];
  private readonly sql: string;

  constructor(commands: string[], sql: string) {
    this.commands = commands;
    this.sql = sql;
  }

  run(...params: SqlValue[]): void {
    this.commands.push(...bindArgs(this.sql, params));
  }

  all(..._params: SqlValue[]): Record<string, unknown>[] {
    throw new Error("select/all is not supported inside transaction()");
  }
}

class Sqlite3Database implements Database {
  private readonly dbPath: string;

  constructor(dbPath: string) {
    this.dbPath = dbPath;
  }

  exec(sql: string): void {
    execSql(this.dbPath, sql, []);
  }

  prepare(sql: string): Statement {
    return new Sqlite3Statement(this.dbPath, sql);
  }

  transaction(fn: (db: Database) => void): void {
    const commands: string[] = [];
    fn(new TxDatabase(commands));
    runScript(this.dbPath, ["BEGIN IMMEDIATE;", ...commands, "COMMIT;"]);
  }

  close(): void {
    logger.info("DB connection closed");
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

/** Database that buffers writes for transaction(); rejects mid-tx queries. */
class TxDatabase implements Database {
  private readonly commands: string[];

  constructor(commands: string[]) {
    this.commands = commands;
  }

  exec(sql: string): void {
    this.commands.push(sql);
  }

  prepare(sql: string): Statement {
    return new TxStatement(this.commands, sql);
  }

  transaction(_fn: (db: Database) => void): void {
    throw new Error("nested transaction() is not supported");
  }

  close(): void {
    throw new Error("close() is not supported inside transaction()");
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

  select(_table: string, _opts: SelectOpts): Record<string, unknown>[] {
    throw new Error("select is not supported inside transaction()");
  }

  selectOne(_table: string, _opts: SelectOpts): Record<string, unknown> | null {
    throw new Error("selectOne is not supported inside transaction()");
  }
}

/** Open a Database for an arbitrary file path (tests and non-singleton use). */
export const openDatabase = (dbPath: string): Database => {
  return new Sqlite3Database(dbPath);
};

let dbInstance: Database | null = null;

/** Singleton pipeline.db under CONFIG.pipelineDbPath. */
export const getPipelineDb = (): Database => {
  if (!dbInstance) {
    dbInstance = new Sqlite3Database(CONFIG.pipelineDbPath);
  }
  return dbInstance;
};

/** Drop the singleton reference (process-level; no open handle to free). */
export const closePipelineDb = (): void => {
  dbInstance = null;
};

export type { Database as DatabaseType };

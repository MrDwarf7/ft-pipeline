/** Pipeline DB singleton via sqlite3 CLI subprocess. No transactions across calls. */

import { CONFIG } from "../config.ts";
import { logger } from "./logger.ts";

export interface Database {
  exec(sql: string): void;
  prepare(sql: string): Statement;
  close(): void;
}

export interface Statement {
  run(...params: (string | number | null)[]): void;
  all<T = Record<string, unknown>>(...params: (string | number | null)[]): T[];
}

// Escape a value for safe inclusion in a SQL string
const escapeValue = (val: string | number | null): string => {
  if (val === null) return "NULL";
  if (typeof val === "number") return String(val);
  return `'${val.replace(/'/g, "''")}'`;
};

// Replace positional ? placeholders with escaped values
const interpolate = (
  sql: string,
  params: (string | number | null)[],
): string => {
  let idx = 0;
  return sql.replace(/\?/g, () => {
    if (idx >= params.length) return "?";
    return escapeValue(params[idx++]);
  });
};

// sqlite3 with stdout as args -- returns stdout text
const sqlite3 = (
  dbPath: string,
  args: string[],
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

// Execute SQL with no result expected (INSERT, UPDATE, CREATE, etc.)
const execSql = (dbPath: string, sql: string): void => {
  const { stderr, code } = sqlite3(dbPath, [sql]);
  if (code !== 0) {
    throw new Error(`sqlite3 error (code ${code}): ${stderr}`);
  }
};

// Run a query and return parsed JSON results
const querySql = (dbPath: string, sql: string): Record<string, unknown>[] => {
  const { stdout, stderr, code } = sqlite3(dbPath, [".mode json", sql]);
  if (code !== 0) {
    throw new Error(`sqlite3 error (code ${code}): ${stderr}`);
  }
  if (!stdout) return [];
  try {
    const parsed = JSON.parse(stdout);
    return Array.isArray(parsed) ? parsed : [parsed];
  } catch {
    return [];
  }
};

// -- Statement implementation --

class Sqlite3Statement implements Statement {
  private dbPath: string;
  private sql: string;

  constructor(dbPath: string, sql: string) {
    this.dbPath = dbPath;
    this.sql = sql;
  }

  run(...params: (string | number | null)[]): void {
    // Support both spread args and single-array arg (common SQL lib pattern)
    const flatParams = params.length === 1 && Array.isArray(params[0])
      ? (params[0] as (string | number | null)[])
      : params;
    const fullSql = flatParams.length > 0 ? interpolate(this.sql, flatParams) : this.sql;
    execSql(this.dbPath, fullSql);
  }

  all<T = Record<string, unknown>>(...params: (string | number | null)[]): T[] {
    const flatParams = params.length === 1 && Array.isArray(params[0])
      ? (params[0] as (string | number | null)[])
      : params;
    const fullSql = flatParams.length > 0 ? interpolate(this.sql, flatParams) : this.sql;
    return querySql(this.dbPath, fullSql) as T[];
  }
}

// -- Database implementation --

class Sqlite3Database implements Database {
  private dbPath: string;

  constructor(dbPath: string) {
    this.dbPath = dbPath;
  }

  exec(sql: string): void {
    execSql(this.dbPath, sql);
  }

  prepare(sql: string): Statement {
    return new Sqlite3Statement(this.dbPath, sql);
  }

  close(): void {
    logger.info("DB connection closed");
  }
}

// -- Singleton management --

let dbInstance: Database | null = null;

export const getPipelineDb = (): Database => {
  if (!dbInstance) {
    dbInstance = new Sqlite3Database(CONFIG.pipelineDbPath);
  }
  return dbInstance;
};

export const closePipelineDb = (): void => {
  dbInstance = null;
};

export type { Database as DatabaseType };

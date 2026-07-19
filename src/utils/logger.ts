/** Structured JSON logger -- stdout (ANSI) + time-rotated file at CONFIG.logDir */

import { CONFIG } from "../config.ts";

const LOG_DIR = CONFIG.logDir;

const encoder = new TextEncoder();

export type LogLevel = "info" | "warn" | "error" | "debug";
export type LogData =
  | Record<string, unknown>
  | string
  | number
  | boolean
  | null
  | undefined;

const formatData = (data: LogData): string => {
  if (data === undefined || data === null) return "";
  if (typeof data === "string") return ` ${data}`;
  if (typeof data === "number" || typeof data === "boolean") return ` ${data}`;
  return ` ${JSON.stringify(data)}`;
};

const COLORS: Record<LogLevel, string> = {
  info: "\x1b[32m", // green
  warn: "\x1b[33m", // yellow
  error: "\x1b[31m", // red
  debug: "\x1b[90m", // bright black / gray
};
const RESET = "\x1b[0m";

const log = (level: LogLevel, message: string, data?: LogData): void => {
  const ts = new Date().toISOString();
  const color = COLORS[level];
  const dataStr = formatData(data);
  const colored = `${ts} ${color}[${level.toUpperCase()}]${RESET} ${message}${dataStr}\n`;
  Deno.stdout.writeSync(encoder.encode(colored));

  // Also write to daily-rotated log file (without ANSI codes)
  const plain = `${ts} [${level.toUpperCase()}] ${message}${dataStr}`;
  logToFile(plain);
};

/* Multi-line block output (help text). Drops to its own line on stdout with no
 * trailing space on the [INFO] prefix; the log file stays single-line. */
export const logBlock = (message: string): void => {
  const body_temp = message.startsWith("\n") ? message.slice(1) : message;
  const body = body_temp.endsWith("\n") ? body_temp.trimEnd() : body_temp;
  const ts = new Date().toISOString();
  const colored = `${ts} ${COLORS.info}[INFO]${RESET}\n${body}\n`;
  Deno.stdout.writeSync(encoder.encode(colored));
  logToFile(`${ts} [INFO] ${body}`);
};

export const logger = {
  info: (message: string, data?: LogData) => log("info", message, data),
  warn: (message: string, data?: LogData) => log("warn", message, data),
  error: (message: string, data?: LogData) => log("error", message, data),
  debug: (message: string, data?: LogData) => log("debug", message, data),
};

let logStream: Deno.FsFile | null = null;
let logDate = "";
let logTime = "";

const getLogFile = (): Deno.FsFile => {
  const now = new Date();
  const date = now.toISOString().slice(0, 10);
  const time = now.toISOString().slice(11, 19); // HH:MM:SS
  const filename = `pipeline-${date}_${time}.log`;

  if (logStream && logDate === date && logTime === time) {
    return logStream;
  }

  logStream?.close();

  try {
    Deno.mkdirSync(LOG_DIR, { recursive: true });
  } catch {
    // ignore if dir already exists
  }

  const path = `${LOG_DIR}/${filename}`;
  logStream = Deno.openSync(path, { write: true, create: true, append: true });
  logDate = date;
  logTime = time;
  return logStream;
};

export const logToFile = (line: string): void => {
  try {
    const file = getLogFile();
    file.writeSync(encoder.encode(line + "\n"));
  } catch {
    // silently fail -- we don't want logging errors to crash the pipeline
  }
};

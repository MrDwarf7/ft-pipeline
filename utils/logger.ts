// utils/logger.ts -- @std/log with rotating file handler
import { ConsoleHandler, getLogger, type LogRecord, RotatingFileHandler, setup } from "@std/log";

const LOG_DIR = `${Deno.env.get("HOME")}/.ft-bookmarks/logs`;
await Deno.mkdir(LOG_DIR, { recursive: true });

const LOG_PATH = `${LOG_DIR}/pipeline.log`;

const fmt = (r: LogRecord, timestamp = false): string => {
  const prefix = timestamp ? `${r.datetime.toISOString()} [${r.levelName}] ` : "";
  const ctx = r.args?.[0] && typeof r.args[0] === "object" ? ` ${JSON.stringify(r.args[0])}` : "";
  return `${prefix}${r.msg}${ctx}`;
};

setup({
  handlers: {
    file: new RotatingFileHandler("INFO", {
      filename: LOG_PATH,
      maxBytes: 10 * 1024 * 1024, // 10MB
      maxBackupCount: 3,
      formatter: (r) => fmt(r, true),
    }),
    console: new ConsoleHandler("INFO", {
      formatter: (r) => fmt(r),
    }),
  },
  loggers: {
    default: {
      level: "INFO",
      handlers: ["file", "console"],
    },
  },
});

export const logger = getLogger();

#!/usr/bin/env -S deno run --allow-all

/**
 * ft-pipeline -- Bookmark sync, extract, classify, generate pipeline
 *
 * Usage:
 *   deno run --allow-all main.ts <command> [options]
 */
import { assertEnvVars } from "./utils/env.ts";
import { Command, parseCliArgs } from "./types.ts";
import { printScreen } from "./commands/help.ts";
import { findHelpScreen } from "./cli-schema.tree.ts";
import { pipeline, runFull } from "./utils/pipeline.ts";
import { checkCookies, runCookieExtract } from "./commands/cookies.ts";
import { runConfig } from "./commands/config.ts";
import { logger } from "./utils/logger.ts";
import { CONFIG } from "./config.ts";

// Commands that need cookies + password -- check env up front
const REQUIRES_COOKIES: Set<Command> = new Set([Command.Sync, Command.Full]);

const cleanupLogs = (): void => {
  if (Deno.env.get("FT_NO_HOUSEKEEPING") === "1") return;

  const logDir = CONFIG.logDir;
  const maxFiles = CONFIG.maxLogFiles;
  try {
    const files = [...Deno.readDirSync(logDir)]
      .filter((f) => f.name.endsWith(".log"))
      .map((f) => f.name)
      .sort();

    if (files.length <= maxFiles) return;

    const toDelete = files.slice(0, files.length - maxFiles);
    for (const name of toDelete) {
      Deno.removeSync(`${logDir}/${name}`);
    }
    logger.info("log housekeeping", {
      deleted: toDelete.length,
      kept: files.length - toDelete.length,
    });
  } catch {
    // dir missing or read error -- not our problem
  }
};

const main = async () => {
  const screen = findHelpScreen(Deno.args);
  if (screen !== null) return printScreen(screen);

  const args = parseCliArgs();
  const [commandArg] = args._.map(String);

  if (!commandArg) return printScreen(findHelpScreen(["--help"]) ?? "");

  const command = commandArg as Command;
  const subcommand = args._[1] ? String(args._[1]) : undefined;
  const rest = args._.slice(2).map(String);

  cleanupLogs();

  // Check required env vars before doing anything
  if (REQUIRES_COOKIES.has(command) && command !== Command.Config) {
    try {
      assertEnvVars(["FT_COOKIES_PATH", "FT_PIPELINE_PASSWORD"]);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error("env check failed", { error: msg });
      Deno.exit(1);
    }
  }

  try {
    switch (command) {
      case Command.Cookies:
        if (subcommand === "extract") await runCookieExtract();
        else if (subcommand === "check") {
          const exists = await checkCookies();
          logger.info("cookies check", { exists });
        } else {
          logger.error("usage", {
            hint: "ft-pipeline cookies [extract|check]",
          });
          Deno.exit(1);
        }
        break;

      case Command.Migrate:
        pipeline.migrate();
        break;

      case Command.Sync:
        await pipeline.sync(args);
        break;

      case Command.Extract:
        pipeline.extract(args);
        break;

      case Command.Merge:
        await pipeline.merge(args);
        break;

      case Command.Classify:
        await pipeline.classify(args);
        break;

      case Command.Generate:
        await pipeline.generate();
        break;

      case Command.Indexes:
        await pipeline.indexes();
        break;

      case Command.Config:
        runConfig({ args, subcommand, rest });
        break;

      case Command.Full:
        await runFull(args);
        break;

      default:
        logger.error("unknown command", { command });
        Deno.exit(1);
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error("pipeline error", { error: msg });
    Deno.exit(1);
  }
};

if (import.meta.main) {
  await main();
}

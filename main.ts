#!/usr/bin/env -S deno run --allow-all

/**
 * ft-pipeline -- Bookmark sync, extract, classify, generate pipeline
 *
 * Usage:
 *   deno run --allow-all main.ts <command> [options]
 */

import { Command, parseCliArgs } from "./types.ts";
import { printHelp } from "./help.ts";
import { pipeline, runFull } from "./pipeline.ts";
import { checkCookies, runCookieExtract } from "./commands/cookies.ts";
import { logger } from "./utils/logger.ts";

const main = async () => {
  const args = parseCliArgs();
  const [commandArg] = args._.map(String);

  if (!commandArg || args.help) return printHelp();

  const command = commandArg as Command;
  const subcommand = args._[1] ? String(args._[1]) : undefined;

  try {
    switch (command) {
      case Command.Cookies:
        if (subcommand === "extract") await runCookieExtract();
        else if (subcommand === "check") {
          const exists = await checkCookies();
          logger.info("cookies check", { exists });
        } else {
          logger.error("usage", { hint: "ft-pipeline cookies [extract|check]" });
          Deno.exit(1);
        }
        break;

      case Command.Migrate:
        pipeline.migrate()();
        break;

      case Command.Sync:
        await pipeline.sync(args)();
        break;

      case Command.Extract:
        await pipeline.extract(args)();
        break;

      case Command.Merge:
        await pipeline.merge(args)();
        break;

      case Command.Classify:
        await pipeline.classify(args)();
        break;

      case Command.Generate:
        await pipeline.generate()();
        break;

      case Command.Indexes:
        await pipeline.indexes()();
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

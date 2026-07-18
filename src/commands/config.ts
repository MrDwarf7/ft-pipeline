/** Config command -- inspect and manage the standalone config file.
 *
 *   ft-pipeline config show          Effective config (file + env overrides)
 *   ft-pipeline config file          Path to the standalone config file
 *   ft-pipeline config init          Write defaults to the file (overwrites)
 *   ft-pipeline config set <k> <v>   Set a top-level key (int/number parsed)
 */

import { type CommandContext, ConfigSub } from "../types.ts";
import { logger } from "../utils/logger.ts";
import {
  CONFIG,
  type Config,
  configFilePath,
  loadConfigFileOrDefault,
  serializeConfig,
  writeConfigFile,
  writeConfigFileDefault,
} from "../config.ts";

export const runConfig = (ctx: CommandContext): void => {
  const sub = ctx.subcommand as ConfigSub | undefined;

  switch (sub) {
    case ConfigSub.Show: {
      logger.info(serializeConfig(CONFIG).trimEnd());
      break;
    }
    case ConfigSub.File: {
      logger.info(configFilePath());
      break;
    }
    case ConfigSub.Init: {
      writeConfigFileDefault();
      logger.info("wrote config defaults", { path: configFilePath() });
      break;
    }
    case ConfigSub.Set: {
      const [key, value] = ctx.rest;
      if (!key || value === undefined) {
        logger.error("usage", { hint: "ft-pipeline config set <key> <value>" });
        Deno.exit(1);
      }
      const current = loadConfigFileOrDefault() as unknown as Record<
        string,
        unknown
      >;
      if (!(key in current)) {
        logger.error("unknown config key", { key });
        Deno.exit(1);
      }
      const parsed: unknown = /^-?\d+$/.test(value) || /^-?\d*\.\d+$/.test(value)
        ? Number(value)
        : value;
      current[key] = parsed;
      writeConfigFile(current as unknown as Config);
      logger.info("updated config", { key, value: String(parsed) });
      break;
    }
    default: {
      logger.error("usage", { hint: "ft-pipeline config [show|file|init|set]" });
      Deno.exit(1);
    }
  }
};

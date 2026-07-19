/** Config command -- inspect and manage the standalone config file.
 *
 *   ft-pipeline config show              Effective config (file + env overrides)
 *   ft-pipeline config file              Path to the standalone config file
 *   ft-pipeline config init              Write defaults to the file (overwrites)
 *   ft-pipeline config set <k> <v>       Set a top-level key (int/number parsed)
 *   ft-pipeline config migrate           Rewrite legacy keys on disk
 *   ft-pipeline config --migrate         Same as migrate
 */
import { type CommandContext, ConfigSub } from "../types.ts";
import { logger } from "../utils/logger.ts";
import {
  CONFIG,
  type Config,
  configFilePath,
  listPendingConfigMigrations,
  loadConfigFileOrDefault,
  migrateConfigFile,
  serializeConfig,
  writeConfigFile,
  writeConfigFileDefault,
} from "../config.ts";

const isMigrateFlag = (argv: readonly string[]): boolean => argv.includes("--migrate");

const runConfigMigrate = (): void => {
  const pending = listPendingConfigMigrations();
  if (pending.length === 0) {
    logger.info("config migrate: nothing to do", { path: configFilePath() });
    return;
  }
  pending.forEach((p) => {
    logger.info("config migrate pending", {
      from: p.from,
      to: p.to,
      oldValue: String(p.oldValue),
      newValue: String(p.newValue),
    });
  });
  const { applied, path } = migrateConfigFile();
  logger.info("config migrate complete", {
    path,
    applied: applied.map((a) => `${a.from} -> ${a.to}`),
  });
};

export const runConfig = (ctx: CommandContext): void => {
  const sub = ctx.subcommand as ConfigSub | undefined;
  const migrateRequested = sub === ConfigSub.Migrate ||
    isMigrateFlag(Deno.args);

  if (migrateRequested) {
    try {
      runConfigMigrate();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error("config migrate failed", { error: msg });
      Deno.exit(1);
    }
    return;
  }

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
      const current: Config = { ...loadConfigFileOrDefault() };
      if (!(key in current)) {
        logger.error("unknown config key", { key });
        Deno.exit(1);
      }
      const parsed: unknown = /^-?\d+$/.test(value) || /^-?\d*\.\d+$/.test(value)
        ? Number(value)
        : value;
      const next = { ...current, [key]: parsed };
      writeConfigFile(next);
      logger.info("updated config", { key, value: String(parsed) });
      break;
    }
    default: {
      logger.error("usage", {
        hint: "ft-pipeline config [show|file|init|set|migrate]",
      });
      Deno.exit(1);
    }
  }
};

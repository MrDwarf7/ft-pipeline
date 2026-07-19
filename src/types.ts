// types.ts -- Command enum, Args interface, parse helpers

import { parseArgs } from "@std/cli/parse-args";
import { getParseArgsConfig } from "./cli-schema.tree.ts";

export const Command = {
  Migrate: "migrate",
  Cookies: "cookies",
  Sync: "sync",
  Extract: "extract",
  Merge: "merge",
  Classify: "classify",
  Generate: "generate",
  Indexes: "indexes",
  Config: "config",
  Full: "full",
} as const;

export type Command = (typeof Command)[keyof typeof Command];

export const ConfigSub = {
  Show: "show",
  File: "file",
  Init: "init",
  Set: "set",
} as const;

export type ConfigSub = (typeof ConfigSub)[keyof typeof ConfigSub];

/** Uniform contract for every dispatched command.
 *  The main dispatch extracts subcommand + rest from raw args ONCE and hands
 *  them in here -- leaf commands must never re-parse args._ themselves. */
export interface CommandContext {
  args: Args;
  subcommand?: string;
  rest: string[];
}

export interface Args {
  _: (string | number)[];
  password?: string;
  limit?: string;
  "dry-run": boolean;
  "skip-existing": boolean;
  help: boolean;
  "max-pages"?: string;
  "target-adds"?: string;
  "max-minutes"?: string;
  rebuild?: boolean;
  continue?: boolean;
  gaps?: boolean;
}

export const parseCliArgs = (): Args => {
  const cfg = getParseArgsConfig();
  return parseArgs(Deno.args, cfg) as Args;
};

export const getPassword = (args: Args): string | undefined =>
  args.password ?? Deno.env.get("FT_PIPELINE_PASSWORD");

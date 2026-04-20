// types.ts -- Command enum, Args interface, parse helpers

import { parseArgs } from "@std/cli/parse-args";
import { getParseArgsConfig } from "./cli-schema.ts";

export const Command = {
  Migrate: "migrate",
  Cookies: "cookies",
  Sync: "sync",
  Extract: "extract",
  Merge: "merge",
  Classify: "classify",
  Generate: "generate",
  Indexes: "indexes",
  Full: "full",
} as const;

export type Command = (typeof Command)[keyof typeof Command];

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

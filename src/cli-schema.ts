// cli-schema.ts -- Single source of truth for CLI commands and options
// Drives both help text generation and parseArgs config.

import { parseArgs } from "@std/cli/parse-args";

export interface OptionDef {
  name: string;
  alias?: string;
  type: "string" | "boolean";
  description: string;
  default?: string | boolean;
}

export interface CommandDef {
  name: string;
  description: string;
}

export const COMMANDS: CommandDef[] = [
  { name: "migrate", description: "Create/migrate pipeline DB schema (run first)" },
  { name: "cookies extract", description: "Extract X session cookies (interactive)" },
  { name: "cookies check", description: "Check if cookies file exists" },
  { name: "sync", description: "Sync bookmarks from X (requires cookies)" },
  { name: "extract", description: "Extract articles via xtracticle + link to DB" },
  { name: "merge", description: "Merge Clippings enriched text back into DB" },
  { name: "classify", description: "LLM classification for unclassified bookmarks" },
  { name: "generate", description: "Regenerate md files from DB" },
  { name: "indexes", description: "Generate category/domain index notes" },
  { name: "full", description: "Run all steps: sync -> extract -> merge -> classify -> generate -> indexes" },
];

export const GLOBAL_OPTIONS: OptionDef[] = [
  { name: "password", alias: "p", type: "string", description: "Cookie decryption password (or FT_PIPELINE_PASSWORD env)" },
  { name: "limit", type: "string", description: "Limit items to process" },
  { name: "dry-run", type: "boolean", description: "Show what would happen without changes", default: false },
  { name: "skip-existing", type: "boolean", description: "Skip already processed items", default: true },
  { name: "help", alias: "h", type: "boolean", description: "Show this help" },
];

export const SYNC_OPTIONS: OptionDef[] = [
  { name: "max-pages", type: "string", description: "Max pages to fetch from X API" },
  { name: "target-adds", type: "string", description: "Stop after N new bookmarks added" },
  { name: "max-minutes", type: "string", description: "Stop after N minutes" },
  { name: "rebuild", type: "boolean", description: "Wipe local DB and re-sync from scratch" },
  { name: "continue", type: "boolean", description: "Resume from last sync position" },
  { name: "gaps", type: "boolean", description: "Backfill missing gaps in the sync range" },
];

const ALL_OPTIONS = [...GLOBAL_OPTIONS, ...SYNC_OPTIONS];

/** Derive parseArgs config from the schema */
export const getParseArgsConfig = (): Parameters<typeof parseArgs>[1] => ({
  string: ALL_OPTIONS.filter((o) => o.type === "string").map((o) => o.name),
  boolean: ALL_OPTIONS.filter((o) => o.type === "boolean").map((o) => o.name),
  alias: Object.fromEntries(
    ALL_OPTIONS.filter((o) => o.alias).map((o) => [o.alias!, o.name]),
  ),
  default: Object.fromEntries(
    ALL_OPTIONS.filter((o) => o.default !== undefined).map((o) => [o.name, o.default]),
  ),
});

/** Generate formatted help text from the schema */
export const generateHelpText = (): string => {
  const lines: string[] = [
    "ft-pipeline -- Bookmark pipeline",
    "",
    "Usage: ft-pipeline <command> [options]",
    "",
    "Commands:",
  ];

  // Align descriptions
  const cmdWidth = Math.max(...COMMANDS.map((c) => c.name.length)) + 2;
  for (const cmd of COMMANDS) {
    lines.push(`  ${cmd.name.padEnd(cmdWidth)}${cmd.description}`);
  }

  lines.push("", "Options:");
  const formattedOpts = GLOBAL_OPTIONS.map((o) => {
    const flag = o.alias ? `-${o.alias}, --${o.name}` : `--${o.name}`;
    const suffix = o.type === "string" ? " <pw>" : "";
    return { label: flag + suffix, desc: o.description };
  });
  const optWidth = Math.max(...formattedOpts.map((o) => o.label.length)) + 2;
  for (const opt of formattedOpts) {
    lines.push(`  ${opt.label.padEnd(optWidth)}${opt.desc}`);
  }

  lines.push("", "Sync options:");
  const formattedSync = SYNC_OPTIONS.map((o) => {
    const flag = `--${o.name}`;
    const suffix = o.type === "string" ? " <n>" : "";
    return { label: flag + suffix, desc: o.description };
  });
  const syncWidth = Math.max(...formattedSync.map((o) => o.label.length)) + 2;
  for (const opt of formattedSync) {
    lines.push(`  ${opt.label.padEnd(syncWidth)}${opt.desc}`);
  }

  return lines.join("\n");
};

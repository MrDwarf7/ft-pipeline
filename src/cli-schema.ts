// cli-schema.ts -- Single source of truth for CLI commands and options
// Drives both help text generation and parseArgs config.

// deno-fmt-ignore-file

import { parseArgs } from "@std/cli/parse-args";

export interface OptionDef {
  name: string;
  alias?: string;
  type: "string" | "boolean";
  description: string;
  help: string;
  default?: string | boolean;
}

export interface CommandDef {
  name: string;
  description: string;
}

export const COMMANDS: CommandDef[] = [
  {
    name: "migrate",
    description: "Create/migrate pipeline DB schema (run first)",
  },
  {
    name: "cookies extract",
    description: "Extract X session cookies (interactive)",
  },
  {
    name: "cookies check",
    description: "Check if cookies file exists",
  },
  {
    name: "sync",
    description: "Sync bookmarks from X (requires cookies)",
  },
  {
    name: "extract",
    description: "Extract articles via xtracticle + link to DB",
  },
  {
    name: "merge",
    description: "Merge Clippings enriched text back into DB",
  },
  {
    name: "classify",
    description: "LLM classification for unclassified bookmarks",
  },
  {
    name: "generate",
    description: "Regenerate md files from DB",
  },
  {
    name: "indexes",
    description: "Generate category/domain index notes",
  },
  {
    name: "config",
    description: "Show or edit the standalone config file",
  },
  {
    name: "full",
    description:
      "Run all steps: sync -> extract -> merge -> classify -> generate -> indexes",
  },
];

export const GLOBAL_OPTIONS: OptionDef[] = [
  {
    name: "password",
    alias: "p",
    type: "string",
    description: "Cookie decryption password (or FT_PIPELINE_PASSWORD env)",
    help: "Password used to decrypt the X session cookies file (.sync-cookies.enc). Falls back to the FT_PIPELINE_PASSWORD env var when omitted. Required for sync and full.",
  },
  {
    name: "limit",
    type: "string",
    description: "Limit items to process",
    help: "Maximum number of items to process this run (tweets to extract or bookmarks to classify). Handy for dry runs and sampling.",
  },
  {
    name: "dry-run",
    type: "boolean",
    description: "Show what would happen without changes",
    help: "Preview the operations that would run without writing to the DB, disk, or any external API. Safe to use at any time.",
    default: false,
  },
  {
    name: "skip-existing",
    type: "boolean",
    description: "Skip already processed items",
    help: "When true (default) items already processed are skipped. Pass --no-skip-existing to force reprocessing.",
    default: true,
  },
  {
    name: "help",
    alias: "h",
    type: "boolean",
    description: "Show this help",
    help: "Print usage for the current command and exit. Accepts -h or --help at any position: 'ft-pipeline --help', 'ft-pipeline config --help', 'ft-pipeline sync --help'.",
  },
];

export const SYNC_OPTIONS: OptionDef[] = [
  {
    name: "max-pages",
    type: "string",
    description: "Max pages to fetch from X API",
    help: "Hard cap on the number of API pages fetched from X during sync. Stops early once reached.",
  },
  {
    name: "target-adds",
    type: "string",
    description: "Stop after N new bookmarks added",
    help: "Stop syncing after N new bookmarks have been added to the local DB. Good for incremental top-ups.",
  },
  {
    name: "max-minutes",
    type: "string",
    description: "Stop after N minutes",
    help: "Abort the sync after N minutes of wall-clock time, checkpointing progress.",
  },
  {
    name: "rebuild",
    type: "boolean",
    description: "Wipe local DB and re-sync from scratch",
    help: "Drops all local bookmark data and re-syncs from the beginning. Destructive -- use with care.",
  },
  {
    name: "continue",
    type: "boolean",
    description: "Resume from last sync position",
    help: "Resume sync from the last saved cursor instead of starting fresh.",
  },
  {
    name: "gaps",
    type: "boolean",
    description: "Backfill missing gaps in the sync range",
    help: "Detect and backfill holes in the already-synced bookmark range.",
  },
];

const ALL_OPTIONS = [...GLOBAL_OPTIONS, ...SYNC_OPTIONS];

/** Set of all top-level command names (drives recursive help descent). */
const COMMAND_NAMES = new Set(COMMANDS.map((c) => c.name.split(" ")[0]));

/** Commands that themselves have subcommands (drive recursive help descent). */
const HELP_TREE: Record<string, { subcommands: string[] }> = {
  config: {
    subcommands: ["show", "file", "init", "set"],
  },
  cookies: {
    subcommands: ["extract", "check"],
  },
};

/** Derive parseArgs config from the schema */
export const getParseArgsConfig = (): Parameters<typeof parseArgs>[1] => ({
  string: ALL_OPTIONS.filter((o) => o.type === "string").map((o) => o.name),
  boolean: ALL_OPTIONS.filter((o) => o.type === "boolean").map((o) => o.name),
  alias: Object.fromEntries(
    ALL_OPTIONS.filter((o) => o.alias).map((o) => [o.alias!, o.name]),
  ),
  default: Object.fromEntries(
    ALL_OPTIONS.filter((o) => o.default !== undefined).map((o) => [
      o.name,
      o.default,
    ]),
  ),
});

export const CONFIG_SUBCOMMANDS: CommandDef[] = [
  {
    name: "show",
    description: "Print effective config (file + env overrides)",
  },
  { name: "file", description: "Print path to the standalone config file" },
  { name: "init", description: "Write built-in defaults to the config file" },
  {
    name: "set",
    description: "Set a top-level key (ft-pipeline config set <key> <value>)",
  },
];

const optLabel = (o: OptionDef): string =>
  `${o.alias ? `-${o.alias}, ` : ""}--${o.name}${o.type === "string" ? " <value>" : ""}`;

const commandDescription = (name: string): string =>
  COMMANDS.find((c) => c.name === name || c.name.startsWith(`${name} `))
    ?.description ?? name;

/** Stepped help for `ft-pipeline config [subcommand] --help`. */
export const generateConfigHelpText = (): string => {
  const lines: string[] = [
    "ft-pipeline config -- Manage the standalone config file",
    "",
    "Usage: ft-pipeline config <subcommand> [args]",
    "",
    "Subcommands:",
  ];

  const width = Math.max(...CONFIG_SUBCOMMANDS.map((c) => c.name.length)) + 2;
  lines.push(
    ...CONFIG_SUBCOMMANDS.map(
      (cmd) => `  ${cmd.name.padEnd(width)}${cmd.description}`,
    ),
  );

  return lines.join("\n");
};

/** Stepped help for `ft-pipeline cookies [subcommand] --help`. */
export const generateCookiesHelpText = (): string =>
  [
    "ft-pipeline cookies -- Manage X session cookies",
    "",
    "Usage: ft-pipeline cookies [extract|check]",
    "",
    "Subcommands:",
    "  extract   Interactive cookie extraction + encrypted save",
    "  check     Check if the cookies file exists",
  ].join("\n");

/** Help for a leaf command (sync/extract/...) -- description + usage only.
 *  Flag options live on the top-level `ft-pipeline --help` screen. */
export const generateCommandHelpText = (name: string): string =>
  [
    `ft-pipeline ${name} -- ${commandDescription(name)}`,
    "",
    `Usage: ft-pipeline ${name} [options]`,
  ].join("\n");

/** Top-level help: commands + all options with their detailed help text. */
export const generateHelpText = (): string => {
  const lines: string[] = [
    "ft-pipeline -- Bookmark pipeline",
    "",
    "Usage: ft-pipeline <command> [options]",
    "",
    "Commands:",
  ];

  const cmdWidth = Math.max(...COMMANDS.map((c) => c.name.length)) + 2;
  lines.push(
    ...COMMANDS.map(
      (cmd) => `  ${cmd.name.padEnd(cmdWidth)}${cmd.description}`,
    ),
  );

  lines.push("", "Options:");
  const gWidth = Math.max(...GLOBAL_OPTIONS.map((o) => optLabel(o).length)) + 2;
  for (const o of GLOBAL_OPTIONS) {
    lines.push(`  ${optLabel(o).padEnd(gWidth)}${o.description}`);
    lines.push(`  ${"".padEnd(gWidth)}${o.help}`);
  }

  lines.push("", "Sync options:");
  const sWidth = Math.max(...SYNC_OPTIONS.map((o) => optLabel(o).length)) + 2;
  for (const o of SYNC_OPTIONS) {
    lines.push(`  ${optLabel(o).padEnd(sWidth)}${o.description}`);
    lines.push(`  ${"".padEnd(sWidth)}${o.help}`);
  }

  return lines.join("\n");
};

const isHelp = (tok: string): boolean => tok === "-h" || tok === "--help";

const resolveNodeHelp = (node: string): string => {
  if (node.startsWith("config")) return generateConfigHelpText();
  if (node.startsWith("cookies")) return generateCookiesHelpText();
  if (node === "") return generateHelpText();
  return generateCommandHelpText(node);
};

/* Recursively walk argv, descending the command tree by positionals, until the
 * help flag is reached -- then render the screen for whatever node we landed on.
 * Returns null when no help flag is present anywhere in the input. */
const descend = (tokens: string[], node: string): string => {
  if (tokens.length === 0) return resolveNodeHelp(node);
  const [head, ...tail] = tokens;
  if (isHelp(head)) return resolveNodeHelp(node);
  if (head.startsWith("-")) return descend(tail, node);
  if (node === "") {
    return descend(tail, COMMAND_NAMES.has(head) ? head : node);
  }
  if (HELP_TREE[node]?.subcommands.includes(head)) {
    return descend(tail, `${node}:${head}`);
  }
  return descend(tail, node);
};

export const findHelpScreen = (argv: string[]): string | null =>
  argv.some(isHelp) ? descend(argv, "") : null;

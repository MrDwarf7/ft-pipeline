/** Recursive help-tree: data, resolvers, and rendering for the ft-pipeline CLI.
 *  Types live in cli-schema.types.ts. Requires noUncheckedIndexedAccess.
 */

import { APP_NAME } from "./consts.ts";
import { parseArgs } from "@std/cli/parse-args";
import type {
  BranchCommand,
  CommandNode,
  GlobalOptions,
  HelpLookup,
  HelpRoot,
  LeafCommand,
  OptionDef,
} from "./cli-schema.types.ts";

type ParseArgsConfig = Parameters<typeof parseArgs>[1];

type ParseAcc = {
  string: string[];
  boolean: string[];
  alias: Record<string, string>;
  default: Record<string, string | boolean>;
};

type WalkCtx = { remaining: readonly string[]; walked: readonly string[] };

const walk = (node: CommandNode, ctx: WalkCtx): HelpLookup => {
  if (ctx.remaining.length === 0) {
    return { found: true, node, path: ctx.walked };
  }

  const [head, ...rest] = ctx.remaining;
  if (head === undefined) {
    return { found: true, node, path: ctx.walked };
  }

  if (node.subcommands === null) {
    return { found: false, path: ctx.walked, failedAt: head, available: [] };
  }

  const next = node.subcommands[head];
  if (!next) {
    return {
      found: false,
      path: ctx.walked,
      failedAt: head,
      available: Object.keys(node.subcommands),
    };
  }

  return walk(next, { remaining: rest, walked: [...ctx.walked, head] });
};

/** resolveHelp(ALL_OPTIONS, []) -> bin --help
 *  resolveHelp(ALL_OPTIONS, ["config"]) -> bin config --help
 *  resolveHelp(ALL_OPTIONS, ["config", "show"]) -> bin config show --help
 *  resolveHelp(ALL_OPTIONS, ["migrate", "oops"]) -> not found at "oops"
 */
export const resolveHelp = (
  root: HelpRoot,
  path: readonly string[],
): HelpLookup => {
  if (path.length === 0) {
    return { found: true, node: root, path: [] };
  }

  const [head, ...rest] = path;
  if (head === undefined) {
    return { found: true, node: root, path: [] };
  }
  const top = root.commands[head];
  if (!top) {
    return {
      found: false,
      path: [],
      failedAt: head,
      available: Object.keys(root.commands),
    };
  }

  return walk(top, { remaining: rest, walked: [head] });
};

/** Type guard: only the root carries globalOptions. */
export const isHelpRoot = (node: HelpRoot | CommandNode): node is HelpRoot =>
  "globalOptions" in node;

/** Every resolvable path (branches and leaves), for completions or exhaustive generation. */
export const listCommandPaths = (
  root: HelpRoot,
): readonly (readonly string[])[] => {
  const collect = (
    node: CommandNode,
    prefix: readonly string[],
  ): readonly (readonly string[])[] => {
    if (node.subcommands === null) return [prefix];
    const children = Object.entries(node.subcommands).flatMap(([key, child]) =>
      collect(child, [...prefix, key])
    );
    return [prefix, ...children];
  };
  return Object.entries(root.commands).flatMap(([key, node]) => collect(node, [key]));
};

/** Global + local options for a node, for rendering. */
export const flattenOptions = (
  root: HelpRoot,
  node: HelpRoot | CommandNode,
): { globals: GlobalOptions; locals: Readonly<Record<string, OptionDef>> } =>
  isHelpRoot(node)
    ? { globals: root.globalOptions, locals: {} }
    : { globals: root.globalOptions, locals: node.options ?? {} };

/** Derive a parseArgs config from the option tree (single source of truth).
 *  Long flags become the option name; short flags become the alias. A present
 *  valueName means string, otherwise boolean. Defaults carry through.
 */
export const getParseArgsConfig = (): ParseArgsConfig => {
  const allOpts: OptionDef[] = [
    ...Object.values(ALL_OPTIONS.globalOptions),
    ...Object.values(ALL_OPTIONS.commands).flatMap((cmd) =>
      "options" in cmd && cmd.options ? Object.values(cmd.options) : []
    ),
  ];

  const acc = allOpts.reduce<ParseAcc>(
    (a, spec) => {
      const long = spec.flags.find((f) => f.startsWith("--"));
      if (!long) return a;
      const name = long.slice(2);
      const short = spec.flags.find(
        (f) => f.startsWith("-") && !f.startsWith("--"),
      );
      if (spec.valueName) a.string.push(name);
      else a.boolean.push(name);
      if (short) a.alias[short.slice(1)] = name;
      if (spec.default !== undefined) a.default[name] = String(spec.default);
      return a;
    },
    { string: [], boolean: [], alias: {}, default: {} },
  );

  return acc;
};

const optLabel = (spec: OptionDef): string =>
  spec.flags.join(", ") + (spec.valueName ? ` ${spec.valueName}` : "");

const renderOptionList = (
  opts: Readonly<Record<string, OptionDef>>,
  lines: string[],
): void => {
  const specs = Object.values(opts);
  const labels = specs.map(optLabel);
  const width = (labels.length ? Math.max(...labels.map((l) => l.length)) : 0) + 2;
  specs.forEach((spec) => {
    const label = optLabel(spec);
    lines.push(`  ${label.padEnd(width)}${spec.description}`);
    if (spec.default !== undefined) {
      lines.push(`  ${"".padEnd(width)}default: ${String(spec.default)}`);
    }
  });
};

/** Render a resolved help lookup to a printable string. */
export const renderHelp = (root: HelpRoot, lookup: HelpLookup): string => {
  if (!lookup.found) {
    const avail = lookup.available.length ? lookup.available.join(", ") : "(none)";
    return [`Unknown command: ${lookup.failedAt}`, `Available: ${avail}`].join(
      "\n",
    );
  }

  const node = lookup.node;
  const path = lookup.path;
  const title = [root.name, ...path].join(" ");
  const lines: string[] = [`${title} -- ${node.description}`, ""];

  if (isHelpRoot(node)) {
    lines.push(`Usage: ${root.name} <command> [options]`, "", "Commands:");
    const width = Math.max(...Object.values(root.commands).map((c) => c.name.length)) + 2;
    Object.entries(root.commands).forEach(([name, cmd]) => {
      lines.push(`  ${name.padEnd(width)}${cmd.description}`);
    });
  } else {
    const isBranch = node.subcommands !== null;
    lines.push(`Usage: ${title} [options]${isBranch ? " <subcommand>" : ""}`);
    if (isBranch) {
      const subs = node.subcommands;
      lines.push("", "Subcommands:");
      const width = Math.max(...Object.keys(subs).map((k) => k.length)) + 2;
      Object.entries(subs).forEach(([name, sub]) => {
        lines.push(`  ${name.padEnd(width)}${sub.description}`);
      });
    }
  }

  const { globals, locals } = flattenOptions(root, node);
  if (Object.keys(locals).length) {
    lines.push("", "Options:");
    renderOptionList(locals, lines);
  }
  lines.push("", "Global options:");
  renderOptionList(Object.fromEntries(Object.entries(globals)), lines);

  return lines.join("\n");
};

/** Pull the positional command path from argv up to the first -h/--help.
 *  Returns null when no help flag is present.
 */
const collectHelpPath = (argv: string[]): string[] | null => {
  const idx = argv.findIndex((t) => t === "-h" || t === "--help");
  return idx === -1 ? null : argv.slice(0, idx);
};

/** Resolve + render the help screen for argv, or null if no -h/--help. */
export const findHelpScreen = (argv: string[]): string | null => {
  const path = collectHelpPath(argv);
  if (path === null) return null;
  return renderHelp(ALL_OPTIONS, resolveHelp(ALL_OPTIONS, path));
};

const migrateCommand = {
  name: "migrate",
  description: "Create/migrate pipeline DB schema (run first)",
  subcommands: null,
} as const satisfies LeafCommand;

const syncCommand = {
  name: "sync",
  description: "Sync bookmarks from X via native GraphQL client",
  options: {
    ftCookies: {
      flags: ["--ft-cookies"],
      description: "Path to encrypted X cookies file",
      valueName: "<PATH>",
    },
    ftPassword: {
      flags: ["--ft-password"],
      description: "Password to decrypt cookies",
      valueName: "<PASS>",
    },
  },
  subcommands: null,
} as const satisfies LeafCommand;

const cookiesCommand = {
  name: "cookies",
  description: "Inspect and clear stored session cookies",
  options: {
    clear: {
      flags: ["--clear"],
      description: "Delete all stored cookies",
    },
  },
  subcommands: null,
} as const satisfies LeafCommand;

const extractCommand = {
  name: "extract",
  description: "Pull content from xtracticle.com API -> Clippings/",
  subcommands: null,
} as const satisfies LeafCommand;

const mergeCommand = {
  name: "merge",
  description: "Merge Clippings enriched text back into DB",
  subcommands: null,
} as const satisfies LeafCommand;

const classifyCommand = {
  name: "classify",
  description: "LLM classification (type + domain) -> DB",
  options: {
    limit: {
      flags: ["--limit"],
      description: "Limit to N bookmarks",
      valueName: "<N>",
    },
  },
  subcommands: null,
} as const satisfies LeafCommand;

const generateCommand = {
  name: "generate",
  description: "Template-based .md generation from pipeline.db",
  subcommands: null,
} as const satisfies LeafCommand;

const indexesCommand = {
  name: "indexes",
  description: "Generate category/domain index pages",
  subcommands: null,
} as const satisfies LeafCommand;

const configCommand = {
  name: "config",
  description: "Show or edit the standalone config file",
  subcommands: {
    show: {
      name: "show",
      description: "Print the resolved configuration",
      options: {
        format: {
          flags: ["--format"],
          description: "Output format",
          valueName: "<json|toml>",
          default: "toml",
        },
      },
      subcommands: null,
    },
    file: {
      name: "file",
      description: "Print the absolute config file path",
      subcommands: null,
    },
    init: {
      name: "init",
      description: "Create a default config file if missing",
      subcommands: null,
    },
    set: {
      name: "set",
      description: "Set a configuration key to a value",
      subcommands: null,
    },
    migrate: {
      name: "migrate",
      description:
        "Rewrite legacy config keys on disk (e.g. maxRetries -> maxExternalCallAttempts)",
      subcommands: null,
    },
  },
} as const satisfies BranchCommand;

export const ALL_OPTIONS = {
  name: APP_NAME,
  description: "ft-pipeline: X/Twitter bookmark processing CLI",
  globalOptions: {
    help: {
      flags: ["-h", "--help"],
      description: "Print help",
    },
    cookies: {
      flags: ["-c", "--cookies"],
      description: "Path to encrypted cookies file",
      valueName: "<PATH>",
    },
    force: {
      flags: ["-f", "--force"],
      description: "Skip confirmation prompts",
    },
    config: {
      flags: ["-C", "--config"],
      description: "Path to config file",
      valueName: "<PATH>",
    },
    version: {
      flags: ["-V", "--version"],
      description: "Print version and exit",
    },
    verbose: {
      flags: ["-v", "--verbose"],
      description: "Increase log verbosity",
    },
    quiet: {
      flags: ["-q", "--quiet"],
      description: "Suppress non-error output",
    },
    log: {
      flags: ["-l", "--log"],
      description: "Write log to file",
      valueName: "<PATH>",
    },
    format: {
      flags: ["-F", "--format"],
      description: "Output format (json|table)",
      valueName: "<json|table>",
    },
    limit: {
      flags: ["-L", "--limit"],
      description: "Limit to N most recent",
      valueName: "<N>",
    },
  },
  commands: {
    migrate: migrateCommand,
    sync: syncCommand,
    cookies: cookiesCommand,
    extract: extractCommand,
    merge: mergeCommand,
    classify: classifyCommand,
    generate: generateCommand,
    indexes: indexesCommand,
    config: configCommand,
  },
} as const satisfies HelpRoot;

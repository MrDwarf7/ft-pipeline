/** Shell completion script generators driven by the CLI schema tree.
 *
 * Usage:
 *   ft-pipeline completion bash  >> ~/.bashrc
 *   ft-pipeline completion zsh   > ~/.zfunc/_ft-pipeline
 *   ft-pipeline completion fish  > ~/.config/fish/completions/ft-pipeline.fish
 *   ft-pipeline completion pwsh  | Out-File -Append $PROFILE
 */

import { ALL_OPTIONS, isHelpRoot, listCommandPaths } from "../cli-schema.tree.ts";
import type { CommandNode, HelpRoot, OptionDef } from "../cli-schema.types.ts";
import { logger } from "../utils/logger.ts";

export const SHELLS = ["bash", "zsh", "fish", "pwsh"] as const;
export type Shell = (typeof SHELLS)[number];

export const isShell = (value: string): value is Shell =>
  (SHELLS as readonly string[]).includes(value);

/** Flatten option flags for a node (local only). */
const localFlags = (node: CommandNode | HelpRoot): readonly string[] => {
  if (isHelpRoot(node)) return [];
  const opts = node.options;
  if (!opts) return [];
  return Object.values(opts).flatMap((o: OptionDef) => o.flags);
};

/** Global flag strings from the root. */
const globalFlags = (root: HelpRoot): readonly string[] =>
  Object.values(root.globalOptions).flatMap((o) => o.flags);

/** Resolve a path to a node under root.commands. */
const nodeAtPath = (
  root: HelpRoot,
  path: readonly string[],
): CommandNode | null => {
  if (path.length === 0) return null;
  const [head, ...rest] = path;
  if (head === undefined) return null;
  let node: CommandNode | undefined = root.commands[head];
  if (!node) return null;
  for (const part of rest) {
    if (node.subcommands === null) return null;
    const next: CommandNode | undefined = node.subcommands[part];
    if (!next) return null;
    node = next;
  }
  return node;
};

/** Child subcommand names under a path (empty path = top-level commands). */
const childrenAt = (root: HelpRoot, path: readonly string[]): readonly string[] => {
  if (path.length === 0) return Object.keys(root.commands);
  const node = nodeAtPath(root, path);
  if (!node || node.subcommands === null) return [];
  return Object.keys(node.subcommands);
};

/** Flags available after a given command path (local + global). */
const flagsAt = (root: HelpRoot, path: readonly string[]): readonly string[] => {
  const globals = globalFlags(root);
  if (path.length === 0) return globals;
  const node = nodeAtPath(root, path);
  if (!node) return globals;
  return [...localFlags(node), ...globals];
};

const uniq = (items: readonly string[]): readonly string[] => [...new Set(items)];

const bashQuote = (s: string): string => `'${s.replaceAll("'", `'\\''`)}'`;

/** Build a bash completion script for `root.name`. */
export const generateBash = (root: HelpRoot): string => {
  const bin = root.name;
  const fn = bin.replaceAll("-", "_");
  const paths = listCommandPaths(root);
  const top = childrenAt(root, []).join(" ");

  const caseArms = paths
    .map((path) => {
      const key = path.join(" ");
      const kids = childrenAt(root, path);
      const flags = flagsAt(root, path);
      const words = uniq([...kids, ...flags]).join(" ");
      return `    ${bashQuote(key)})
      COMPREPLY=( $(compgen -W ${bashQuote(words)} -- "$cur") )
      return
      ;;`;
    })
    .join("\n");

  const topWords = bashQuote(`${top} ${flagsAt(root, []).join(" ")}`);
  const fallbackWords = bashQuote(`${top} ${globalFlags(root).join(" ")}`);

  return [
    `# bash completion for ${bin}`,
    `# Install: eval "$(${bin} completion bash)"`,
    "",
    `_${fn}() {`,
    `  local cur`,
    `  COMPREPLY=()`,
    `  cur="\${COMP_WORDS[COMP_CWORD]}"`,
    `  local -a pos=()`,
    `  local i w`,
    `  for ((i = 1; i < COMP_CWORD; i++)); do`,
    `    w="\${COMP_WORDS[i]}"`,
    `    [[ "$w" == -* ]] && continue`,
    `    pos+=("$w")`,
    `  done`,
    `  local path_key="\${pos[*]}"`,
    `  case "$path_key" in`,
    caseArms,
    `    "")`,
    `      COMPREPLY=( $(compgen -W ${topWords} -- "$cur") )`,
    `      return`,
    `      ;;`,
    `  esac`,
    `  COMPREPLY=( $(compgen -W ${fallbackWords} -- "$cur") )`,
    `}`,
    "",
    `complete -F _${fn} ${bin}`,
    "",
  ].join("\n");
};

/** Build a zsh completion script. */
export const generateZsh = (root: HelpRoot): string => {
  const bin = root.name;
  const fn = bin.replaceAll("-", "_");
  const paths = listCommandPaths(root);
  const top = childrenAt(root, []);

  const caseArms = paths
    .map((path) => {
      const key = path.join(" ");
      const kids = childrenAt(root, path);
      const flags = flagsAt(root, path);
      const words = uniq([...kids, ...flags]);
      const quoted = words.map((w) => bashQuote(w)).join(" ");
      return [
        `    ${bashQuote(key)})`,
        `      _arguments '*: :(${quoted})' && return`,
        `      ;;`,
      ].join("\n");
    })
    .join("\n");

  const topWords = uniq([...top, ...globalFlags(root)])
    .map((w) => bashQuote(w))
    .join(" ");

  return [
    `#compdef ${bin}`,
    `# zsh completion for ${bin}`,
    `# Install: ${bin} completion zsh > "\${fpath[1]}/_${bin}" && compinit`,
    "",
    `_${fn}() {`,
    `  local -a pos`,
    `  local w`,
    `  for w in "\${words[@]:1:$((CURRENT - 2))}"; do`,
    `    [[ "$w" == -* ]] && continue`,
    `    pos+=("$w")`,
    `  done`,
    `  local path_key="\${(j: :)pos}"`,
    `  case "$path_key" in`,
    caseArms,
    `    "")`,
    `      _arguments '*: :(${topWords})' && return`,
    `      ;;`,
    `  esac`,
    `  _arguments '*: :(${topWords})'`,
    `}`,
    "",
    `compdef _${fn} ${bin}`,
    "",
  ].join("\n");
};

/** Build a fish completion script. */
export const generateFish = (root: HelpRoot): string => {
  const bin = root.name;
  const lines: string[] = [
    `# fish completion for ${bin}`,
    `# Install: ${bin} completion fish > ~/.config/fish/completions/${bin}.fish`,
    "",
  ];

  // Top-level commands
  Object.entries(root.commands).forEach(([name, cmd]) => {
    lines.push(
      `complete -c ${bin} -n "__fish_use_subcommand" -a ${bashQuote(name)} -d ${
        bashQuote(cmd.description)
      }`,
    );
  });

  // Globals at top
  Object.values(root.globalOptions).forEach((opt) => {
    const long = opt.flags.find((f: string) => f.startsWith("--"));
    const short = opt.flags.find((f: string) => f.startsWith("-") && !f.startsWith("--"));
    if (!long) return;
    const shortPart = short ? ` -s ${bashQuote(short.slice(1))}` : "";
    const require = opt.valueName ? " -r" : "";
    lines.push(
      `complete -c ${bin} -n "__fish_use_subcommand"${shortPart} -l ${
        bashQuote(long.slice(2))
      }${require} -d ${bashQuote(opt.description)}`,
    );
  });

  // Nested paths
  listCommandPaths(root).forEach((path) => {
    if (path.length === 0) return;
    const parent = path.slice(0, -1);
    const leaf = path[path.length - 1];
    if (leaf === undefined) return;
    const node = nodeAtPath(root, path);
    if (!node) return;

    if (parent.length === 0) {
      // already emitted as top-level command
    } else {
      // condition: previous tokens include parent chain
      const seen = parent
        .map((p) => `__fish_seen_subcommand_from ${p}`)
        .join("; and ");
      // and not deeper siblings already chosen beyond parent... fish heuristic:
      lines.push(
        `complete -c ${bin} -n ${bashQuote(seen)} -a ${bashQuote(leaf)} -d ${
          bashQuote(node.description)
        }`,
      );
    }

    // flags for this command when path is active
    const condParts = path.map((p) => `__fish_seen_subcommand_from ${p}`);
    const cond = condParts.join("; and ");
    localFlags(node).forEach((flag) => {
      if (!flag.startsWith("--")) return;
      lines.push(
        `complete -c ${bin} -n ${bashQuote(cond)} -l ${bashQuote(flag.slice(2))}`,
      );
    });
  });

  return lines.join("\n") + "\n";
};

/** Build a PowerShell Register-ArgumentCompleter script. */
export const generatePwsh = (root: HelpRoot): string => {
  const bin = root.name;
  const paths = listCommandPaths(root);

  // Map path key -> completion words
  const mapEntries = [
    `    '' = @(${
      uniq([...childrenAt(root, []), ...globalFlags(root)])
        .map((w) => `'${w.replaceAll("'", "''")}'`)
        .join(", ")
    })`,
    ...paths.map((path) => {
      const key = path.join(" ");
      const words = uniq([...childrenAt(root, path), ...flagsAt(root, path)]);
      const arr = words.map((w) => `'${w.replaceAll("'", "''")}'`).join(", ");
      return `    '${key.replaceAll("'", "''")}' = @(${arr})`;
    }),
  ].join("\n");

  return `# PowerShell completion for ${bin}
# Install: ${bin} completion pwsh | Out-String | Invoke-Expression
# Or append to $PROFILE

Register-ArgumentCompleter -Native -CommandName '${bin}' -ScriptBlock {
  param($wordToComplete, $commandAst, $cursorPosition)

  $map = @{
${mapEntries}
  }

  $tokens = @($commandAst.CommandElements | ForEach-Object { $_.ToString() })
  # drop binary name; drop current incomplete word if present
  if ($tokens.Count -gt 0) { $tokens = $tokens[1..($tokens.Count - 1)] }
  $pos = @()
  foreach ($t in $tokens) {
    if ($t -like '-*') { continue }
    if ($t -eq $wordToComplete) { continue }
    $pos += $t
  }
  $key = [string]::Join(' ', $pos)
  $words = $map[$key]
  if (-not $words) { $words = $map[''] }

  $words | Where-Object { $_ -like "$wordToComplete*" } | ForEach-Object {
    [System.Management.Automation.CompletionResult]::new($_, $_, 'ParameterValue', $_)
  }
}
`;
};

export const generateCompletion = (root: HelpRoot, shell: Shell): string => {
  switch (shell) {
    case "bash":
      return generateBash(root);
    case "zsh":
      return generateZsh(root);
    case "fish":
      return generateFish(root);
    case "pwsh":
      return generatePwsh(root);
  }
};

/** CLI entry: print completion script for a shell name to stdout. */
export const runCompletion = (shellArg: string | undefined): void => {
  if (!shellArg || !isShell(shellArg)) {
    logger.error("usage", {
      hint: `ft-pipeline completion <${SHELLS.join("|")}>`,
    });
    Deno.exit(1);
  }
  const script = generateCompletion(ALL_OPTIONS, shellArg);
  const body = script.endsWith("\n") ? script : `${script}\n`;
  Deno.stdout.writeSync(new TextEncoder().encode(body));
};

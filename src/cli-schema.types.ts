/**
 * Help-schema types -- pure type layer for the recursive help tree.
 * Data and resolvers live in cli-schema.tree.ts.
 *
 */
export interface OptionDef {
  readonly flags: readonly string[]; // ["-v", "--verbose"] -- all forms incl. aliases
  readonly description: string;
  readonly valueName?: string; // "<PATH>" -- omit for boolean flags
  readonly default?: string | number | boolean;
  readonly required?: boolean;
}

export interface GlobalOptions {
  readonly help: OptionDef;
  readonly cookies: OptionDef;
  readonly force: OptionDef;
  readonly config: OptionDef;
  readonly version: OptionDef;
  readonly verbose: OptionDef;
  readonly quiet: OptionDef;
  readonly log: OptionDef;
  readonly format: OptionDef;
  readonly limit: OptionDef;
  // extend here when you add more true globals
}

interface CommandNodeBase {
  readonly name: string;
  readonly description: string;
  /** Flags local to this command (e.g. `config show --format json`). */
  readonly options?: Readonly<Record<string, OptionDef>>;
}

/* The union below is DISCRIMINATED SOLELY by the `subcommands` field:
 *   - LeafCommand:   subcommands: null
 *   - BranchCommand: subcommands: Record<...>
 * Both variants MUST declare `subcommands` explicitly. Do NOT make it optional
 * on either side. This is a deliberate footgun-prevention choice, not styling:
 *
 *   1. If `subcommands` were optional, a BRANCH that omits it (typo, refactor,
 *      or a copy-paste from a leaf) would still compile, and the resolver would
 *      treat `undefined` as "no children" -- the command silently becomes a
 *      dead leaf with no error. Users get empty/missing help and the bug stays
 *      hidden until someone notices. Requiring it turns that silent runtime
 *      failure into a compile error (`satisfies BranchCommand` rejects a
 *      missing map at the definition site).
 *
 *   2. If `subcommands` were optional on LeafCommand too, both variants could
 *      have `subcommands?` absent, so the union loses its discriminant and
 *      TypeScript can no longer distinguish leaves from branches. We lose type
 *      narrowing and exhaustiveness on CommandNode.
 *
 *   3. Keeping `subcommands: null` (not mere absence) makes the resolver's
 *      `node.subcommands === null` a SOUND leaf check with no `=== undefined`
 *      fallback needed. null is the explicit "I am terminal by construction"
 *      signal. This is why every leaf below is written with `subcommands: null`
 *      even though it looks redundant.
 *
 */

/** Terminal command -- nothing further underneath. `subcommands: null` is the
 *  discriminant and MUST be written explicitly on every leaf (see note above).
 *
 */
export interface LeafCommand extends CommandNodeBase {
  readonly subcommands: null;
}

/** Command that fans out to more commands. `subcommands` is REQUIRED (not
 *  optional) so a branch missing its subcommand map fails to typecheck instead
 *  of silently resolving as a dead leaf (see note above).
 *
 */
export interface BranchCommand extends CommandNodeBase {
  readonly subcommands: Readonly<Record<string, CommandNode>>;
}

/** Self-referential union covering every depth. Discriminated by `subcommands`
 *  (null = leaf, Record = branch). Neither variant may make `subcommands`
 *  optional -- see the note above for why.
 *
 */
export type CommandNode = LeafCommand | BranchCommand;

export type Commands = Readonly<Record<string, CommandNode>>;

/* TODO: consider deriving it from
 * Omit<CommandNodeBase, "options" | "subcommands"> & { globalOptions; commands }
 * so name/description stay in sync with CommandNodeBase. HelpLookup's .node
 * half could also be tightened.
 *
 */

/** HelpRoot is the tree top: app identity, global options, and the command map. */
export interface HelpRoot {
  readonly name: string;
  readonly description: string;
  readonly globalOptions: GlobalOptions;
  readonly commands: Commands;
}

export type HelpLookup =
  | {
      readonly found: true;
      readonly node: HelpRoot | CommandNode;
      readonly path: readonly string[];
    }
  | {
      readonly found: false;
      readonly path: readonly string[];
      readonly failedAt: string;
      /** Valid keys at the failure point. Empty when the parent was a leaf. */
      readonly available: readonly string[];
    };

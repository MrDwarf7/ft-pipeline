/** Option definitions moved into the command tree.
 *
 * The old `OptionDef` (name/alias/type/help) shape is superseded by the
 * `OptionSpec` tree in cli-schema.tree.ts (types in cli-schema.types.ts).
 * Help options now live inline on each command node (`options: { ... }`)
 * instead of a flat global list. Kept only as a tombstone -- do not add
 * options here.
 */

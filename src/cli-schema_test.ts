import { assertEquals } from "@std/assert";
import { ALL_OPTIONS, findHelpScreen, getParseArgsConfig } from "./cli-schema.tree.ts";

Deno.test("top-level help lists core commands", () => {
  const help = findHelpScreen(["--help"]) ?? "";
  assertEquals(help.includes("migrate"), true);
  assertEquals(help.includes("merge"), true);
  assertEquals(help.includes("config"), true);
});

Deno.test("config subcommand help lists subs", () => {
  const help = findHelpScreen(["config", "--help"]) ?? "";
  assertEquals(help.includes("show"), true);
  assertEquals(help.includes("set"), true);
  assertEquals(help.includes("migrate"), true);
});

Deno.test("parse config: valueName => string, else boolean", () => {
  const cfg = getParseArgsConfig();
  const booleans = cfg?.boolean ?? [];
  const strings = cfg?.string ?? [];
  // cookies carries valueName "<PATH>" -> string
  assertEquals(Array.isArray(strings) && strings.includes("cookies"), true);
  // help has no valueName -> boolean
  assertEquals(Array.isArray(booleans) && booleans.includes("help"), true);
});

Deno.test("tree exposes all 9 top commands", () => {
  const names = Object.keys(ALL_OPTIONS.commands);
  assertEquals(names.length, 9);
});

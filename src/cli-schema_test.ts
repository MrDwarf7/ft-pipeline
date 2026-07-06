import { assertEquals } from "@std/assert";
import { generateHelpText, getParseArgsConfig } from "./cli-schema.ts";

Deno.test("generateHelpText includes core commands", () => {
  const help = generateHelpText();
  assertEquals(help.includes("migrate"), true);
  assertEquals(help.includes("full"), true);
  assertEquals(help.includes("merge"), true);
});

Deno.test("getParseArgsConfig lists dry-run as boolean", () => {
  const cfg = getParseArgsConfig();
  const booleans = cfg?.boolean;
  const strings = cfg?.string;
  assertEquals(Array.isArray(booleans) && booleans.includes("dry-run"), true);
  assertEquals(Array.isArray(strings) && strings.includes("password"), true);
});

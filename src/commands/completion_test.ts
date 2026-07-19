import { assertEquals, assertStringIncludes } from "@std/assert";
import { ALL_OPTIONS } from "../cli-schema.tree.ts";
import {
  generateBash,
  generateCompletion,
  generateFish,
  generatePwsh,
  generateZsh,
  isShell,
  SHELLS,
} from "./completion.ts";

Deno.test("isShell accepts known shells only", () => {
  assertEquals(isShell("bash"), true);
  assertEquals(isShell("pwsh"), true);
  assertEquals(isShell("cmd"), false);
});

Deno.test("SHELLS lists four targets", () => {
  assertEquals([...SHELLS], ["bash", "zsh", "fish", "pwsh"]);
});

Deno.test("bash script names binary and top commands", () => {
  const script = generateBash(ALL_OPTIONS);
  assertStringIncludes(script, "complete -F");
  assertStringIncludes(script, ALL_OPTIONS.name);
  assertStringIncludes(script, "migrate");
  assertStringIncludes(script, "completion");
  assertStringIncludes(script, "full");
  assertStringIncludes(script, "config");
});

Deno.test("zsh script is a compdef", () => {
  const script = generateZsh(ALL_OPTIONS);
  assertStringIncludes(script, `#compdef ${ALL_OPTIONS.name}`);
  assertStringIncludes(script, "show");
  assertStringIncludes(script, "migrate");
});

Deno.test("fish script registers top-level commands", () => {
  const script = generateFish(ALL_OPTIONS);
  assertStringIncludes(script, `complete -c ${ALL_OPTIONS.name}`);
  assertStringIncludes(script, "-a 'sync'");
  assertStringIncludes(script, "cookies");
});

Deno.test("pwsh script registers native completer", () => {
  const script = generatePwsh(ALL_OPTIONS);
  assertStringIncludes(script, "Register-ArgumentCompleter");
  assertStringIncludes(script, ALL_OPTIONS.name);
  assertStringIncludes(script, "completion");
});

Deno.test("generateCompletion dispatches per shell", () => {
  const bash = generateCompletion(ALL_OPTIONS, "bash");
  assertStringIncludes(bash, "COMPREPLY");
  const fish = generateCompletion(ALL_OPTIONS, "fish");
  assertStringIncludes(fish, "complete -c");
});

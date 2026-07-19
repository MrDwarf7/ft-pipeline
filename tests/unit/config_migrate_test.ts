/** Unit tests for pure config key renames (maxRetries -> maxExternalCallAttempts). */
import { assertEquals } from "@std/assert";
import { applyConfigKeyRenames, CONFIG_KEY_RENAMES } from "../../src/config.ts";

Deno.test("applyConfigKeyRenames rewrites maxRetries to maxExternalCallAttempts", () => {
  const { next, applied } = applyConfigKeyRenames(
    { maxRetries: 3, llmModel: "gemma" },
    CONFIG_KEY_RENAMES,
  );
  assertEquals(next.maxRetries, undefined);
  assertEquals(next.maxExternalCallAttempts, 3);
  assertEquals(next.llmModel, "gemma");
  assertEquals(applied.length, 1);
  assertEquals(applied[0]?.from, "maxRetries");
  assertEquals(applied[0]?.to, "maxExternalCallAttempts");
});

Deno.test("applyConfigKeyRenames keeps existing maxExternalCallAttempts when both set", () => {
  const { next, applied } = applyConfigKeyRenames(
    { maxRetries: 9, maxExternalCallAttempts: 2 },
    CONFIG_KEY_RENAMES,
  );
  assertEquals(next.maxRetries, undefined);
  assertEquals(next.maxExternalCallAttempts, 2);
  assertEquals(applied.length, 1);
  assertEquals(applied[0]?.newValue, 2);
});

Deno.test("applyConfigKeyRenames is a no-op when already modern", () => {
  const { next, applied } = applyConfigKeyRenames(
    { maxExternalCallAttempts: 4 },
    CONFIG_KEY_RENAMES,
  );
  assertEquals(applied.length, 0);
  assertEquals(next.maxExternalCallAttempts, 4);
});

Deno.test("applyConfigKeyRenames clamps zero maxRetries to at least 1 attempt", () => {
  const { next } = applyConfigKeyRenames(
    { maxRetries: 0 },
    CONFIG_KEY_RENAMES,
  );
  assertEquals(next.maxExternalCallAttempts, 1);
});

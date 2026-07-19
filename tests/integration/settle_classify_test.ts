/** Cross-module settleClassify: per-item failure must not reject the batch. */

import { assertEquals, assertRejects } from "@std/assert";
import { settleClassify } from "../../src/commands/classify.ts";
import type { ClassifyResult } from "../../src/commands/classify-llm.ts";

const ok = (value: ClassifyResult): Promise<ClassifyResult> => Promise.resolve(value);

const boom = (message: string): Promise<ClassifyResult> => Promise.reject(new Error(message));

Deno.test("integration: settleClassify maps success and failure results", async () => {
  assertEquals(
    await settleClassify("t-ok", ok("classified")),
    "classified",
  );
  assertEquals(
    await settleClassify("t-fail", boom("llm overload")),
    "failed",
  );
});

Deno.test("integration: settleClassify batch tallies classified vs failed", async () => {
  const results = await Promise.all([
    settleClassify("a", ok("classified")),
    settleClassify("b", boom("timeout")),
    settleClassify("c", ok("classified")),
    settleClassify("d", boom("empty content")),
    settleClassify("e", ok("classified")),
  ]);

  const classified = results.filter((r) => r === "classified").length;
  const failed = results.filter((r) => r === "failed").length;
  assertEquals(results, [
    "classified",
    "failed",
    "classified",
    "failed",
    "classified",
  ]);
  assertEquals(classified, 3);
  assertEquals(failed, 2);
});

Deno.test("integration: raw Promise.all still rejects without settleClassify", async () => {
  await assertRejects(
    () =>
      Promise.all([
        ok("classified"),
        boom("unsettled boom"),
      ]),
    Error,
    "unsettled boom",
  );
});

Deno.test("integration: settled batch never rejects even when all items fail", async () => {
  const results = await Promise.all([
    settleClassify("x", boom("1")),
    settleClassify("y", boom("2")),
  ]);
  assertEquals(results, ["failed", "failed"]);
});

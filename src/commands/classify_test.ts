import { assertEquals, assertRejects } from "@std/assert";
import { settleClassify } from "./classify.ts";
import type { ClassifyResult } from "./classify-llm.ts";

Deno.test("settleClassify returns classified when work succeeds", async () => {
  const result = await settleClassify(
    "tweet-ok",
    Promise.resolve("classified" as ClassifyResult),
  );
  assertEquals(result, "classified");
});

Deno.test("settleClassify maps throw to failed without rejecting", async () => {
  const result = await settleClassify(
    "tweet-fail",
    Promise.reject(new Error("llm timeout")),
  );
  assertEquals(result, "failed");
});

Deno.test("settleClassify batch: one throw becomes failed, others keep going", async () => {
  const results = await Promise.all([
    settleClassify("a", Promise.resolve("classified" as ClassifyResult)),
    settleClassify("b", Promise.reject(new Error("boom"))),
    settleClassify("c", Promise.resolve("classified" as ClassifyResult)),
  ]);
  assertEquals(results, ["classified", "failed", "classified"]);
});

Deno.test("raw Promise.all rejects when a row throws without settleClassify", async () => {
  await assertRejects(
    () =>
      Promise.all([
        Promise.resolve("classified" as ClassifyResult),
        Promise.reject(new Error("boom")),
      ]),
    Error,
    "boom",
  );
});

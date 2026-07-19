import { assertEquals } from "@std/assert";
import { hashContent, hashesMatch, needsUpdate } from "../../../src/utils/hash.ts";

Deno.test("hashContent is stable for same input", async () => {
  const a = await hashContent("hello");
  const b = await hashContent("hello");
  assertEquals(a, b);
  assertEquals(a.length, 64);
});

Deno.test("hashesMatch is case insensitive", () => {
  assertEquals(hashesMatch("AbCd", "abcd"), true);
  assertEquals(hashesMatch("abc", "def"), false);
});

Deno.test("needsUpdate returns true when path is null", async () => {
  assertEquals(await needsUpdate(null, "/tmp", "content"), true);
});

Deno.test("needsUpdate returns false when file hash matches content", async () => {
  const dir = await Deno.makeTempDir({ prefix: "ft-hash-" });
  const content = "index page body";
  await Deno.writeTextFile(`${dir}/page.md`, content);
  try {
    assertEquals(await needsUpdate("page.md", dir, content), false);
    assertEquals(await needsUpdate("page.md", dir, content + "\n"), true);
  } finally {
    await Deno.remove(dir, { recursive: true });
  }
});

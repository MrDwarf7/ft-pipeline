import { assertEquals } from "@std/assert";
import { extractBody, parseFrontmatter } from "../../../src/utils/frontmatter.ts";

Deno.test("parseFrontmatter reads tweet_id and quoted values", () => {
  const md = `---
tweet_id: "12345"
type: article
---
body`;
  const fm = parseFrontmatter(md);
  assertEquals(fm.tweet_id, "12345");
  assertEquals(fm.type, "article");
});

Deno.test("parseFrontmatter returns empty object without frontmatter", () => {
  assertEquals(parseFrontmatter("no frontmatter here"), {});
});

Deno.test("extractBody strips frontmatter", () => {
  const md = `---
tweet_id: 1
---
Hello world`;
  assertEquals(extractBody(md), "Hello world");
});

Deno.test("extractBody returns trimmed content when no frontmatter", () => {
  assertEquals(extractBody("  plain  "), "plain");
});

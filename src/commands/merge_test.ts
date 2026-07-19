import { assertEquals } from "@std/assert";
import { clippingTypeRank, shouldPreferClipping } from "./merge.ts";

Deno.test("clippingTypeRank: article > post > media", () => {
  assertEquals(clippingTypeRank("article") > clippingTypeRank("post"), true);
  assertEquals(clippingTypeRank("post") > clippingTypeRank("media"), true);
  assertEquals(clippingTypeRank("article") > clippingTypeRank("media"), true);
});

Deno.test("clippingTypeRank: extract singular labels", () => {
  assertEquals(clippingTypeRank("article"), 3);
  assertEquals(clippingTypeRank("post"), 2);
  assertEquals(clippingTypeRank("media"), 1);
});

Deno.test("clippingTypeRank: legacy plural labels match singular", () => {
  assertEquals(clippingTypeRank("articles"), clippingTypeRank("article"));
  assertEquals(clippingTypeRank("posts"), clippingTypeRank("post"));
});

Deno.test("clippingTypeRank: unknown type is lowest", () => {
  assertEquals(clippingTypeRank("unknown"), 0);
  assertEquals(clippingTypeRank(""), 0);
});

Deno.test("shouldPreferClipping: first entry always wins", () => {
  assertEquals(shouldPreferClipping(undefined, "media"), true);
  assertEquals(shouldPreferClipping(undefined, "post"), true);
  assertEquals(shouldPreferClipping(undefined, "article"), true);
});

Deno.test("shouldPreferClipping: richer type replaces poorer", () => {
  assertEquals(shouldPreferClipping("media", "post"), true);
  assertEquals(shouldPreferClipping("media", "article"), true);
  assertEquals(shouldPreferClipping("post", "article"), true);
});

Deno.test("shouldPreferClipping: poorer type does not replace richer", () => {
  assertEquals(shouldPreferClipping("article", "post"), false);
  assertEquals(shouldPreferClipping("article", "media"), false);
  assertEquals(shouldPreferClipping("post", "media"), false);
});

Deno.test("shouldPreferClipping: equal rank keeps existing", () => {
  assertEquals(shouldPreferClipping("post", "post"), false);
  assertEquals(shouldPreferClipping("article", "articles"), false);
});

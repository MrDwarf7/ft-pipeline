/** Integration-style merge priority: article > post > media (+ legacy plurals). */

import { assertEquals } from "@std/assert";
import { clippingTypeRank, shouldPreferClipping } from "../../src/commands/merge.ts";
import { extractBody, parseFrontmatter } from "../../src/utils/frontmatter.ts";

/**
 * Simulate merge's per-tweet_id selection without touching the filesystem:
 * walk candidates in encounter order and keep the highest-rank type.
 */
const resolveWinningClipping = (
  candidates: ReadonlyArray<{ type: string; body: string }>,
): { type: string; body: string } | undefined =>
  candidates.reduce<
    { type: string; body: string } | undefined
  >((winner, candidate) => {
    if (shouldPreferClipping(winner?.type, candidate.type)) return candidate;
    return winner;
  }, undefined);

Deno.test("integration: merge priority ranks article above post and media", () => {
  assertEquals(clippingTypeRank("article"), 3);
  assertEquals(clippingTypeRank("articles"), 3);
  assertEquals(clippingTypeRank("post"), 2);
  assertEquals(clippingTypeRank("posts"), 2);
  assertEquals(clippingTypeRank("media"), 1);
  assertEquals(clippingTypeRank("unknown"), 0);
});

Deno.test("integration: merge prefers article over earlier media/post candidates", () => {
  const winner = resolveWinningClipping([
    { type: "media", body: "image caption" },
    { type: "post", body: "short post body" },
    { type: "article", body: "full article body" },
  ]);
  assertEquals(winner, { type: "article", body: "full article body" });
});

Deno.test("integration: merge keeps richer clipping when poorer arrives later", () => {
  const winner = resolveWinningClipping([
    { type: "article", body: "rich" },
    { type: "post", body: "poorer" },
    { type: "media", body: "poorest" },
  ]);
  assertEquals(winner, { type: "article", body: "rich" });
});

Deno.test("integration: merge legacy plural labels compete at same rank", () => {
  // Equal rank does not replace -- first wins (matches shouldPreferClipping).
  const winner = resolveWinningClipping([
    { type: "posts", body: "first posts body" },
    { type: "post", body: "second post body" },
  ]);
  assertEquals(winner, { type: "posts", body: "first posts body" });
  assertEquals(shouldPreferClipping("posts", "post"), false);
  assertEquals(shouldPreferClipping("post", "articles"), true);
});

Deno.test("integration: clipping frontmatter type feeds merge priority", () => {
  const mediaMd = `---
tweet_id: "tw-1"
type: media
---
media body`;
  const articleMd = `---
tweet_id: "tw-1"
type: article
---
article body`;

  const mediaFm = parseFrontmatter(mediaMd);
  const articleFm = parseFrontmatter(articleMd);
  assertEquals(mediaFm.tweet_id, "tw-1");
  assertEquals(articleFm.tweet_id, "tw-1");

  const winner = resolveWinningClipping([
    { type: mediaFm.type ?? "post", body: extractBody(mediaMd) },
    { type: articleFm.type ?? "post", body: extractBody(articleMd) },
  ]);
  assertEquals(winner?.type, "article");
  assertEquals(winner?.body, "article body");
});

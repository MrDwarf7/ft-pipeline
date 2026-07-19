/** Fixture-driven extract classifyTweet + article image pipeline. */

import { assertEquals, assertThrows } from "@std/assert";
import { CONFIG } from "../../src/config.ts";
import {
  classifyTweet,
  extractArticleImages,
  extractArticleText,
  getEffectiveText,
  normalizeMedia,
} from "../../src/commands/extract/classify.ts";
import { parseXtracticleResponse } from "../../src/extraction/xtracticle-schema.ts";
import { loadFixture } from "../fixtures/load.ts";

const firstTweet = async (relativePath: string) => {
  const parsed = parseXtracticleResponse(await loadFixture(relativePath));
  const tweet = parsed.tweets[0];
  if (tweet === undefined) throw new Error(`empty tweets in ${relativePath}`);
  return tweet;
};

Deno.test("integration: xtracticle article -> article type + cover/inline images", async () => {
  const tweet = await firstTweet("xtracticle/thread-article.json");

  const classification = classifyTweet(tweet);
  assertEquals(classification.type, "article");
  assertEquals(classification.dir, CONFIG.clippingDirs.articles);

  assertEquals(extractArticleImages(tweet), [
    "https://cdn.example/cover.jpg",
    "https://cdn.example/inline-1.jpg",
  ]);

  assertEquals(
    extractArticleText(tweet.article),
    "Opening paragraph about agentic workflows.\n\nSecond section with tooling notes.",
  );
  assertEquals(
    getEffectiveText(tweet),
    "Opening paragraph about agentic workflows.\n\nSecond section with tooling notes.",
  );

  // Article + tweet media: still article (media does not override content type).
  assertEquals(normalizeMedia(tweet.media).length, 1);
});

Deno.test("integration: xtracticle media-only short text -> media", async () => {
  const tweet = await firstTweet("xtracticle/thread-media-only.json");
  const classification = classifyTweet(tweet);
  assertEquals(classification.type, "media");
  assertEquals(classification.dir, CONFIG.clippingDirs.media);
  assertEquals(extractArticleImages(tweet), []);
  assertEquals(getEffectiveText(tweet), "👀");
});

Deno.test("integration: xtracticle long text without article -> article", async () => {
  const tweet = await firstTweet("xtracticle/thread-long-post.json");
  assertEquals(
    (tweet.text ?? "").length >= CONFIG.minPostTextLength,
    true,
  );
  const classification = classifyTweet(tweet);
  assertEquals(classification.type, "article");
  assertEquals(classification.dir, CONFIG.clippingDirs.articles);
  assertEquals(extractArticleImages(tweet), []);
});

Deno.test("integration: xtracticle short text no media -> post", async () => {
  const tweet = await firstTweet("xtracticle/thread-short-post.json");
  const classification = classifyTweet(tweet);
  assertEquals(classification.type, "post");
  assertEquals(classification.dir, CONFIG.clippingDirs.posts);
});

Deno.test("integration: parseXtracticleResponse rejects schema drift", () => {
  assertThrows(
    () => parseXtracticleResponse({ tweets: [{ id: "broken" }] }),
    Error,
    "xtracticle response schema mismatch",
  );
});

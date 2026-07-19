import { assertEquals } from "@std/assert";
import { CONFIG } from "../../config.ts";
import type { XtracticleTweet } from "../../extraction/xtracticle-schema.ts";
import {
  classifyTweet,
  extractArticleImages,
  extractArticleText,
  getEffectiveText,
  normalizeMedia,
} from "./classify.ts";

const baseTweet = (overrides: Partial<XtracticleTweet>): XtracticleTweet => ({
  id: "123",
  url: "https://x.com/u/status/123",
  text: "",
  author: { screen_name: "u", name: "User" },
  created_at: "Mon Jan 01 00:00:00 +0000 2024",
  ...overrides,
});

Deno.test("normalizeMedia: empty when missing or null", () => {
  assertEquals(normalizeMedia(undefined), []);
  assertEquals(normalizeMedia(null), []);
});

Deno.test("normalizeMedia: flat array passes through", () => {
  const media = [{ id: "1", url: "https://img/a.jpg", type: "photo" }];
  assertEquals(normalizeMedia(media), media);
});

Deno.test("normalizeMedia: prefers .all then .photos", () => {
  const all = [{ url: "https://img/all.jpg", type: "photo" }];
  const photos = [{ url: "https://img/p.jpg", type: "photo" }];
  assertEquals(normalizeMedia({ all, photos }), all);
  assertEquals(normalizeMedia({ photos }), photos);
  assertEquals(normalizeMedia({ mosaic: {} }), []);
});

Deno.test("classifyTweet: media-only short text -> media", () => {
  const tweet = baseTweet({
    text: "hi",
    media: [{ url: "https://img/a.jpg", type: "photo" }],
  });
  const result = classifyTweet(tweet);
  assertEquals(result.type, "media");
  assertEquals(result.dir, CONFIG.clippingDirs.media);
});

Deno.test("classifyTweet: article blocks -> article even with media", () => {
  const tweet = baseTweet({
    text: "short",
    media: [{ url: "https://img/a.jpg", type: "photo" }],
    article: {
      content: { blocks: [{ text: "body" }] },
    },
  });
  const result = classifyTweet(tweet);
  assertEquals(result.type, "article");
  assertEquals(result.dir, CONFIG.clippingDirs.articles);
});

Deno.test("classifyTweet: long text without article -> article", () => {
  const tweet = baseTweet({
    text: "x".repeat(CONFIG.minPostTextLength),
  });
  const result = classifyTweet(tweet);
  assertEquals(result.type, "article");
  assertEquals(result.dir, CONFIG.clippingDirs.articles);
});

Deno.test("classifyTweet: short text no media no article -> post", () => {
  const tweet = baseTweet({ text: "hello world" });
  const result = classifyTweet(tweet);
  assertEquals(result.type, "post");
  assertEquals(result.dir, CONFIG.clippingDirs.posts);
});

Deno.test("extractArticleImages: cover + inline, de-duplicated", () => {
  const shared = "https://cdn.example/shared.jpg";
  const tweet = baseTweet({
    article: {
      cover_media: {
        media_info: { original_img_url: shared },
      },
      media_entities: [
        { media_info: { original_img_url: shared } },
        { media_info: { original_img_url: "https://cdn.example/inline.jpg" } },
        { media_info: {} },
        {},
      ],
    },
  });
  assertEquals(extractArticleImages(tweet), [
    shared,
    "https://cdn.example/inline.jpg",
  ]);
});

Deno.test("extractArticleImages: empty without article", () => {
  assertEquals(extractArticleImages(baseTweet({})), []);
  assertEquals(extractArticleImages(baseTweet({ article: null })), []);
});

Deno.test("extractArticleText: joins non-empty blocks", () => {
  const text = extractArticleText({
    content: {
      blocks: [
        { text: "First" },
        { text: "  " },
        { text: "Second" },
        {},
      ],
    },
  });
  assertEquals(text, "First\n\nSecond");
});

Deno.test("getEffectiveText: tweet + article body", () => {
  const tweet = baseTweet({
    text: "Tweet body",
    article: {
      content: { blocks: [{ text: "Article body" }] },
    },
  });
  assertEquals(getEffectiveText(tweet), "Tweet body\n\nArticle body");
});

Deno.test("getEffectiveText: article only when tweet text empty", () => {
  const tweet = baseTweet({
    text: "",
    article: {
      content: { blocks: [{ text: "Only article" }] },
    },
  });
  assertEquals(getEffectiveText(tweet), "Only article");
});

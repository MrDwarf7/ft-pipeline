/** Fixture-driven integration coverage for GraphQL parseResponse. */

import { assertEquals, assertThrows } from "@std/assert";
import { dirname, fromFileUrl, join } from "@std/path";
import { parseResponse } from "../../src/extraction/parse.ts";
import { loadFixture } from "../fixtures/load.ts";

const extractionFixture = async (name: string): Promise<unknown> => {
  const dir = join(
    dirname(fromFileUrl(import.meta.url)),
    "../../src/extraction/fixtures",
  );
  const raw = await Deno.readTextFile(join(dir, name));
  return JSON.parse(raw);
};

Deno.test("integration: parseResponse bookmarks-page-ok (shared extraction fixture)", async () => {
  const page = parseResponse(await extractionFixture("bookmarks-page-ok.json"));
  assertEquals(page.records.length, 1);
  assertEquals(page.records[0]?.id, "2039805659525644595");
  assertEquals(page.records[0]?.author.screen_name, "karpathy");
  assertEquals(page.records[0]?.text, "LLM Knowledge Bases -- full note text body");
  assertEquals(page.nextCursor, "DAACCgACEgUT6sAAKgAA");
  assertEquals(page.stats.tweetsParsed, 1);
  assertEquals(page.stats.entriesSeen, 2);
});

Deno.test("integration: parseResponse multi-tweet flat + nested wrapper", async () => {
  const page = parseResponse(
    await loadFixture("graphql/bookmarks-page-multi.json"),
  );
  assertEquals(page.records.length, 2);
  assertEquals(page.records[0]?.id, "1001");
  assertEquals(page.records[0]?.author.screen_name, "alice");
  assertEquals(page.records[0]?.text, "first bookmark text");
  assertEquals(page.records[1]?.id, "1002");
  assertEquals(page.records[1]?.author.screen_name, "bob");
  assertEquals(page.records[1]?.text, "nested visibility wrapper");
  assertEquals(page.nextCursor, "cursor-multi-next");
  assertEquals(page.stats.entriesSeen, 3);
  assertEquals(page.stats.tweetsParsed, 2);
  assertEquals(page.stats.entriesSkipped, 1);
});

Deno.test("integration: parseResponse prefers extended_entities media and drops t.co links", async () => {
  const page = parseResponse(
    await loadFixture("graphql/bookmarks-page-media.json"),
  );
  assertEquals(page.records.length, 1);
  const tweet = page.records[0];
  if (tweet === undefined) throw new Error("expected media tweet");

  assertEquals(tweet.id, "2001");
  assertEquals(tweet.media?.all.length, 1);
  assertEquals(tweet.media?.all[0]?.type, "photo");
  assertEquals(
    tweet.media?.all[0]?.url,
    "https://pbs.twimg.com/media/extended-photo.jpg",
  );
  assertEquals(
    tweet.media?.all[0]?.original_img_url,
    "https://pbs.twimg.com/media/original.jpg",
  );

  const links = JSON.parse(tweet.links_json ?? "[]") as string[];
  assertEquals(links, ["https://cdn.example/real-link"]);
  assertEquals(tweet.engagement?.viewCount, 12345);
  assertEquals(tweet.engagement?.likeCount, 42);
  assertEquals(page.nextCursor, "cursor-after-media");
});

Deno.test("integration: parseResponse skips non-tweet modules and uses legacy text", async () => {
  const page = parseResponse(
    await loadFixture("graphql/bookmarks-page-skipped-modules.json"),
  );
  assertEquals(page.records.length, 1);
  assertEquals(page.records[0]?.id, "3001");
  assertEquals(page.records[0]?.text, "legacy text field only");
  assertEquals(page.nextCursor, "cursor-skip-next");
  assertEquals(page.stats.entriesSeen, 3);
  assertEquals(page.stats.tweetsParsed, 1);
  assertEquals(page.stats.entriesSkipped, 2);
});

Deno.test("integration: parseResponse hard-fails on errors-only fixture", async () => {
  const json = await loadFixture("graphql/bookmarks-page-errors.json");
  assertThrows(
    () => parseResponse(json),
    Error,
    "X API returned errors: Rate limit exceeded; Over capacity",
  );
});

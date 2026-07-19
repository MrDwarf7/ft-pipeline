import { assertEquals, assertThrows } from "@std/assert";
import { dirname, fromFileUrl, join } from "@std/path";
import { parseResponse } from "./parse.ts";
import { BookmarksResponseSchema, TweetDataSchema } from "./schema.ts";

const fixturesDir = join(dirname(fromFileUrl(import.meta.url)), "fixtures");

const loadFixture = async (name: string): Promise<unknown> => {
  const raw = await Deno.readTextFile(join(fixturesDir, name));
  return JSON.parse(raw);
};

const minimalTweetResult = {
  legacy: {
    id_str: "999",
    full_text: "hello",
    created_at: "Mon Jan 01 00:00:00 +0000 2024",
    favorite_count: 1,
    retweet_count: 0,
    reply_count: 0,
    quote_count: 0,
    bookmark_count: 0,
  },
  core: {
    user_results: {
      result: {
        core: {
          screen_name: "tester",
          name: "Test User",
        },
      },
    },
  },
};

const makePage = (
  tweetResults: unknown[],
  bottomCursor: string | undefined,
): unknown => {
  const entries = tweetResults.map((tr, i) => ({
    entryId: `tweet-${i}`,
    content: {
      itemContent: {
        tweet_results: { result: tr },
      },
    },
  }));

  const withCursor = bottomCursor === undefined ? entries : [
    ...entries,
    {
      entryId: "cursor-bottom-123",
      content: { value: bottomCursor },
    },
  ];

  return {
    data: {
      bookmark_timeline_v2: {
        timeline: {
          instructions: [
            { type: "TimelineAddEntries", entries: withCursor },
          ],
        },
      },
    },
  };
};

Deno.test("TweetDataSchema accepts minimal GraphQL-shaped payload", () => {
  const parsed = TweetDataSchema.parse({ tweet: minimalTweetResult });
  assertEquals(parsed.tweet.legacy.id_str, "999");
  assertEquals(
    parsed.tweet.core.user_results.result.core.screen_name,
    "tester",
  );
});

Deno.test("TweetDataSchema rejects missing legacy id_str", () => {
  const bad = structuredClone({ tweet: minimalTweetResult });
  // @ts-expect-error intentional bad fixture
  delete bad.tweet.legacy.id_str;
  assertThrows(() => TweetDataSchema.parse(bad));
});

Deno.test("parseResponse maps flat tweet + cursor from fixture JSON", async () => {
  const json = await loadFixture("bookmarks-page-ok.json");
  const page = parseResponse(json);

  assertEquals(page.records.length, 1);
  const tweet = page.records[0];
  if (tweet === undefined) throw new Error("expected one tweet");
  assertEquals(tweet.id, "2039805659525644595");
  assertEquals(tweet.author.screen_name, "karpathy");
  assertEquals(tweet.text, "LLM Knowledge Bases -- full note text body");
  assertEquals(page.nextCursor, "DAACCgACEgUT6sAAKgAA");
  assertEquals(page.stats.entriesSeen, 2);
  assertEquals(page.stats.tweetsParsed, 1);
  assertEquals(page.stats.entriesSkipped, 1);
});

Deno.test("parseResponse accepts nested tweet wrapper format", () => {
  const page = parseResponse(
    makePage([{ tweet: minimalTweetResult }], "cursor-abc"),
  );
  assertEquals(page.records.length, 1);
  assertEquals(page.records[0]?.id, "999");
  assertEquals(page.nextCursor, "cursor-abc");
  assertEquals(page.stats.entriesSeen, 2);
  assertEquals(page.stats.tweetsParsed, 1);
});

Deno.test("parseResponse accepts flat tweet format", () => {
  const page = parseResponse(makePage([minimalTweetResult], undefined));
  assertEquals(page.records.length, 1);
  assertEquals(page.records[0]?.id, "999");
  assertEquals(page.nextCursor, undefined);
  assertEquals(page.stats.entriesSeen, 1);
  assertEquals(page.stats.tweetsParsed, 1);
  assertEquals(page.stats.entriesSkipped, 0);
});

Deno.test("parseResponse hard-fails on missing data with errors", () => {
  assertThrows(
    () =>
      parseResponse({
        errors: [{ message: "Not authorized" }],
      }),
    Error,
    "X API returned errors: Not authorized",
  );
});

Deno.test("parseResponse hard-fails on missing bookmark_timeline_v2", () => {
  assertThrows(
    () => parseResponse({ data: { something_else: true } }),
    Error,
    "bookmark_timeline_v2",
  );
});

Deno.test("parseResponse hard-fails when tweet_results exist but none parse", () => {
  const broken = {
    legacy: { full_text: "no id" },
    core: { user_results: { result: { core: {} } } },
  };
  assertThrows(
    () => parseResponse(makePage([broken], undefined)),
    Error,
    "schema drift",
  );
});

Deno.test("parseResponse allows empty page (cursor-only)", () => {
  const page = parseResponse(makePage([], "end-cursor"));
  assertEquals(page.records.length, 0);
  assertEquals(page.nextCursor, "end-cursor");
  assertEquals(page.stats.entriesSeen, 1);
  assertEquals(page.stats.tweetsParsed, 0);
  assertEquals(page.stats.entriesSkipped, 1);
});

Deno.test("BookmarksResponseSchema accepts errors-only payload", () => {
  const parsed = BookmarksResponseSchema.parse({
    errors: [{ message: "Rate limit" }],
  });
  assertEquals(parsed.errors?.[0]?.message, "Rate limit");
});

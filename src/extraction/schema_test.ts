import { assertEquals } from "@std/assert";
import { TweetDataSchema } from "./schema.ts";

const minimalTweet = {
  tweet: {
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
  },
};

Deno.test("TweetDataSchema accepts minimal GraphQL-shaped payload", () => {
  const parsed = TweetDataSchema.parse(minimalTweet);
  assertEquals(parsed.tweet.legacy.id_str, "999");
  assertEquals(parsed.tweet.core.user_results.result.core.screen_name, "tester");
});

Deno.test("TweetDataSchema rejects missing legacy id_str", () => {
  const bad = structuredClone(minimalTweet);
  // @ts-expect-error intentional bad fixture
  delete bad.tweet.legacy.id_str;
  let failed = false;
  try {
    TweetDataSchema.parse(bad);
  } catch {
    failed = true;
  }
  assertEquals(failed, true);
});

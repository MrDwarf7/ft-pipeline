import { assertEquals, assertMatch, assertStringIncludes } from "@std/assert";
import { buildFilename, type FilenameInput } from "../../../src/commands/generate.ts";

// buildFilename only reads posted_at / author_handle / display_text.
type GenInput = FilenameInput;

const base = (overrides: Partial<GenInput> = {}): GenInput => ({
  posted_at: "2026-07-23T23:00:00Z",
  author_handle: "kimi",
  display_text: "the kimi k3 phenomenon what deepseek has to do with it",
  ...overrides,
});

Deno.test("buildFilename: uses DOW segment, not a doubled numeric day", () => {
  const name = buildFilename(base());
  // Format: YYYY_MM_DD-Dow-@handle-slug.md
  // Regression guard: the refactor once produced YYYY_MM_DD-DD- (numeric day twice).
  assertEquals(
    name,
    "2026_07_23-Thu-kimi-the-kimi-k3-phenomenon-what-deepseek-has-to-do-with-it.md",
  );
});

Deno.test("buildFilename: DOW is a real weekday name, not a number", () => {
  const name = buildFilename(base({ posted_at: "2026-06-07T10:00:00Z" }));
  const middle = name.split("-")[1];
  assertEquals(middle, "Sun");
  assertMatch(name, /^2026_06_07-Sun-/);
});

Deno.test("buildFilename: never produces a doubled numeric-day segment", () => {
  const name = buildFilename(base({ posted_at: "2026-07-23T23:00:00Z" }));
  // The broken pattern was _MM_DD-DD- (date then day number again).
  assertEquals(/_\d{2}-\d{2}-/.test(name), false);
});

Deno.test("buildFilename: DOW matches the parsed date", () => {
  const cases: Array<[string, string]> = [
    ["2026-01-01T00:00:00Z", "Thu"],
    ["2026-06-07T00:00:00Z", "Sun"],
    ["2026-07-23T00:00:00Z", "Thu"],
    ["2026-12-25T00:00:00Z", "Fri"],
  ];
  for (const [iso, dow] of cases) {
    const name = buildFilename(base({ posted_at: iso }));
    assertEquals(name.split("-")[1], dow);
  }
});

Deno.test("buildFilename: slug derives from display_text", () => {
  const name = buildFilename(base({ display_text: "Hello WORLD! This is a Test" }));
  assertStringIncludes(name, "hello-world-this-is-a-test");
});

Deno.test("buildFilename: empty date degrades to epoch defaults (ok:false path)", () => {
  const name = buildFilename(base({ posted_at: "" }));
  assertMatch(name, /^1970_01_01-(Sun|Mon|Tue|Wed|Thu|Fri|Sat)-kimi-/);
  assertEquals(/_\d{2}-\d{2}-/.test(name), false);
});

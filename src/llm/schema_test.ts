import { assertEquals, assertThrows } from "@std/assert";
import {
  assistantTextFromCompletion,
  ChatCompletionSchema,
  modelIdsFromResponse,
  ModelsResponseSchema,
} from "./schema.ts";

Deno.test("ModelsResponseSchema accepts OpenAI data array", () => {
  const parsed = ModelsResponseSchema.parse({
    object: "list",
    data: [{ id: "gemma", object: "model" }],
  });
  assertEquals(parsed.data?.map((m) => m.id), ["gemma"]);
});

Deno.test("ModelsResponseSchema accepts models array alias", () => {
  const parsed = ModelsResponseSchema.parse({
    models: [{ id: "local-1" }],
  });
  assertEquals(parsed.models?.map((m) => m.id), ["local-1"]);
});

Deno.test("modelIdsFromResponse prefers data then models", () => {
  assertEquals(
    modelIdsFromResponse({ data: [{ id: "a" }, { id: "b" }] }),
    ["a", "b"],
  );
  assertEquals(modelIdsFromResponse({ models: [{ id: "x" }] }), ["x"]);
});

Deno.test("modelIdsFromResponse throws when no models loaded", () => {
  assertThrows(() => modelIdsFromResponse({}), Error, "no models loaded");
  assertThrows(
    () => modelIdsFromResponse({ data: [] }),
    Error,
    "no models loaded",
  );
});

Deno.test("modelIdsFromResponse rejects non-object bodies", () => {
  assertThrows(() => modelIdsFromResponse(null), Error);
  assertThrows(() => modelIdsFromResponse("nope"), Error);
});

Deno.test("ChatCompletionSchema requires at least one choice", () => {
  assertThrows(
    () => ChatCompletionSchema.parse({ choices: [] }),
    Error,
  );
});

Deno.test("assistantTextFromCompletion prefers content over reasoning", () => {
  assertEquals(
    assistantTextFromCompletion({
      choices: [{
        message: { content: "hello", reasoning_content: "think" },
      }],
    }),
    "hello",
  );
});

Deno.test("assistantTextFromCompletion falls back to reasoning_content", () => {
  assertEquals(
    assistantTextFromCompletion({
      choices: [{
        message: { content: "", reasoning_content: "reasoned" },
      }],
    }),
    "reasoned",
  );
  assertEquals(
    assistantTextFromCompletion({
      choices: [{
        message: { content: null, reasoning_content: "only-reason" },
      }],
    }),
    "only-reason",
  );
});

Deno.test("assistantTextFromCompletion throws on empty assistant content", () => {
  assertThrows(
    () =>
      assistantTextFromCompletion({
        choices: [{ message: { content: "", reasoning_content: "" } }],
      }),
    Error,
    "empty assistant content",
  );
  assertThrows(
    () =>
      assistantTextFromCompletion({
        choices: [{ message: { content: null, reasoning_content: null } }],
      }),
    Error,
    "empty assistant content",
  );
});

Deno.test("assistantTextFromCompletion rejects invalid envelope", () => {
  assertThrows(() => assistantTextFromCompletion({}), Error);
  assertThrows(() => assistantTextFromCompletion({ choices: [] }), Error);
});

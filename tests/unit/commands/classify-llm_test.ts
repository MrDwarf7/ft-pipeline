import { assertEquals, assertThrows } from "@std/assert";
import { parseLLMResponse } from "../../../src/commands/classify-llm.ts";

Deno.test("parseLLMResponse parses valid JSON object", () => {
  const raw =
    `{"types":["tool"],"primary_type":"tool","domains":["programming"],"primary_domain":"programming","confidence":0.92}`;
  const r = parseLLMResponse(raw);
  assertEquals(r.primary_type, "tool");
  assertEquals(r.primary_domain, "programming");
  assertEquals(r.confidence, 0.92);
  assertEquals(r.types, ["tool"]);
});

Deno.test("parseLLMResponse clamps confidence to [0,1]", () => {
  const raw =
    `{"types":["opinion"],"primary_type":"opinion","domains":["culture"],"primary_domain":"culture","confidence":1.5}`;
  assertEquals(parseLLMResponse(raw).confidence, 1);
});

Deno.test("parseLLMResponse falls back for unknown taxonomy values", () => {
  const raw =
    `{"types":["not-a-type"],"primary_type":"not-a-type","domains":["not-a-domain"],"primary_domain":"not-a-domain","confidence":0.5}`;
  const r = parseLLMResponse(raw);
  assertEquals(r.primary_type, "opinion");
  assertEquals(r.primary_domain, "culture");
  assertEquals(r.types, []);
  assertEquals(r.domains, []);
});

Deno.test("parseLLMResponse throws when no JSON present", () => {
  assertThrows(() => parseLLMResponse("no json here"), Error);
});

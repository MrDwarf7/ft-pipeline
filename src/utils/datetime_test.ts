import { assertEquals } from "@std/assert";
import { parseDate } from "./datetime.ts";

const EPOCH_PARTS = {
  year: "1970",
  month: "01",
  day: "01",
  dow: "Thu",
  hh: "00",
  mm: "00",
  iso: "1970-01-01T00:00:00.000Z",
};

Deno.test("parseDate: empty string returns ok:false with epoch defaults", () => {
  const r = parseDate("");
  assertEquals(r.ok, false);
  assertEquals(r.parts, EPOCH_PARTS);
});

Deno.test("parseDate: null returns ok:false with epoch defaults", () => {
  const r = parseDate(null);
  assertEquals(r.ok, false);
  assertEquals(r.parts, EPOCH_PARTS);
});

Deno.test("parseDate: undefined returns ok:false with epoch defaults", () => {
  const r = parseDate(undefined);
  assertEquals(r.ok, false);
  assertEquals(r.parts, EPOCH_PARTS);
});

Deno.test("parseDate: garbage string returns ok:false with epoch defaults", () => {
  const r = parseDate("not-a-date");
  assertEquals(r.ok, false);
  assertEquals(r.parts, EPOCH_PARTS);
});

Deno.test("parseDate: ISO date yields ok:true and UTC parts", () => {
  const r = parseDate("2020-08-28T15:30:00.000Z");
  assertEquals(r.ok, true);
  assertEquals(r.parts.year, "2020");
  assertEquals(r.parts.month, "08");
  assertEquals(r.parts.day, "28");
  assertEquals(r.parts.dow, "Fri");
  assertEquals(r.parts.hh, "15");
  assertEquals(r.parts.mm, "30");
  assertEquals(r.parts.iso, "2020-08-28T15:30:00.000Z");
});

Deno.test("parseDate: ISO date-only string yields ok:true", () => {
  const r = parseDate("2024-01-02");
  assertEquals(r.ok, true);
  assertEquals(r.parts.year, "2024");
  assertEquals(r.parts.month, "01");
  assertEquals(r.parts.day, "02");
  assertEquals(r.parts.iso.startsWith("2024-01-02"), true);
});

Deno.test("parseDate: Twitter-style created_at yields ok:true", () => {
  // X GraphQL / legacy format: "Fri Aug 28 15:30:00 +0000 2020"
  const r = parseDate("Fri Aug 28 15:30:00 +0000 2020");
  assertEquals(r.ok, true);
  assertEquals(r.parts.year, "2020");
  assertEquals(r.parts.month, "08");
  assertEquals(r.parts.day, "28");
  assertEquals(r.parts.dow, "Fri");
  assertEquals(r.parts.hh, "15");
  assertEquals(r.parts.mm, "30");
  assertEquals(r.parts.iso, "2020-08-28T15:30:00.000Z");
});

Deno.test("parseDate: zero-pads single-digit month/day/hour/minute", () => {
  const r = parseDate("2021-03-05T04:07:00.000Z");
  assertEquals(r.ok, true);
  assertEquals(r.parts.month, "03");
  assertEquals(r.parts.day, "05");
  assertEquals(r.parts.hh, "04");
  assertEquals(r.parts.mm, "07");
});

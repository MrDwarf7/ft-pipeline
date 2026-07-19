/** Extra parseDate edges beyond the colocated unit suite. */

import { assertEquals } from "@std/assert";
import { parseDate } from "../../src/utils/datetime.ts";

const EPOCH = {
  year: "1970",
  month: "01",
  day: "01",
  dow: "Thu",
  hh: "00",
  mm: "00",
  iso: "1970-01-01T00:00:00.000Z",
};

Deno.test("integration: parseDate whitespace-only is unparseable", () => {
  const r = parseDate("   ");
  // Date("   ") is Invalid Date in modern engines -> ok:false.
  assertEquals(r.ok, false);
  assertEquals(r.parts, EPOCH);
});

Deno.test("integration: parseDate single-digit year string is accepted by Date", () => {
  // V8 treats Date("0") as a year near Y2K, not Invalid Date. Exact UTC year can be
  // 1999 or 2000 depending on host TZ (local parse of "0"), so only assert ok + century.
  const r = parseDate("0");
  assertEquals(r.ok, true);
  const year = Number(r.parts.year);
  assertEquals(year >= 1999 && year <= 2000, true);
});

Deno.test("integration: parseDate pure garbage is unparseable", () => {
  const r = parseDate("definitely-not-a-date");
  assertEquals(r.ok, false);
  assertEquals(r.parts, EPOCH);
});

Deno.test("integration: parseDate end-of-year UTC boundary", () => {
  const r = parseDate("2023-12-31T23:59:00.000Z");
  assertEquals(r.ok, true);
  assertEquals(r.parts.year, "2023");
  assertEquals(r.parts.month, "12");
  assertEquals(r.parts.day, "31");
  assertEquals(r.parts.hh, "23");
  assertEquals(r.parts.mm, "59");
  assertEquals(r.parts.dow, "Sun");
});

Deno.test("integration: parseDate leap day", () => {
  const r = parseDate("2024-02-29T12:00:00.000Z");
  assertEquals(r.ok, true);
  assertEquals(r.parts.year, "2024");
  assertEquals(r.parts.month, "02");
  assertEquals(r.parts.day, "29");
  assertEquals(r.parts.dow, "Thu");
});

Deno.test("integration: parseDate Twitter offset non-UTC still yields ok parts", () => {
  // GraphQL often uses +0000; non-UTC offsets still parse via Date.
  const r = parseDate("Mon Jun 01 12:00:00 +0000 2020");
  assertEquals(r.ok, true);
  assertEquals(r.parts.iso, "2020-06-01T12:00:00.000Z");
  assertEquals(r.parts.month, "06");
  assertEquals(r.parts.day, "01");
});

Deno.test("integration: parseDate empty/null/undefined share epoch defaults", () => {
  for (const input of [null, undefined, ""] as const) {
    const r = parseDate(input);
    assertEquals(r.ok, false);
    assertEquals(r.parts, EPOCH);
  }
});

/** Date parsing shared by extract/generate/indexes. Wraps the official Date
 *  parser so a bad or missing timestamp degrades to safe defaults instead of
 *  throwing or yielding undefined fields (the old regex/array-index code did
 *  both under noUncheckedIndexedAccess).
 */

const DOW_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export interface DateParts {
  readonly year: string;
  readonly month: string;
  readonly day: string;
  readonly dow: string;
  readonly hh: string;
  readonly mm: string;
  readonly iso: string;
}

export type DateParseResult =
  | { readonly ok: true; readonly parts: DateParts }
  | { readonly ok: false; readonly parts: DateParts };

const defaults = (d: Date): DateParts => ({
  year: String(d.getUTCFullYear()),
  month: String(d.getUTCMonth() + 1).padStart(2, "0"),
  day: String(d.getUTCDate()).padStart(2, "0"),
  dow: DOW_NAMES[d.getUTCDay()] ?? DOW_NAMES[0] ?? "Sun",
  hh: String(d.getUTCHours()).padStart(2, "0"),
  mm: String(d.getUTCMinutes()).padStart(2, "0"),
  iso: d.toISOString(),
});

/** Parse any Date-accepted string (ISO or Twitter "Fri Aug 28 ... +0000 2020").
 *  Returns ok:false with epoch defaults when input is empty/unparseable, so
 *  callers either branch on ok or read parts directly (never undefined).
 */
export const parseDate = (input: string | null | undefined): DateParseResult => {
  if (!input) return { ok: false, parts: defaults(new Date(0)) };
  try {
    const d = new Date(input);
    if (Number.isNaN(d.getTime())) return { ok: false, parts: defaults(new Date(0)) };
    return { ok: true, parts: defaults(d) };
  } catch {
    return { ok: false, parts: defaults(new Date(0)) };
  }
};

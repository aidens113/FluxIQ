// The parity table for value reading (P7). Core's readers and the downstream
// web domain's (its condition number and page-side sort readers) must agree on
// every case here; Core's tests run them against Core's readers, and a domain
// imports this constant to run them against its own.

import type { AutomationStudioRecordSortReading } from "./sort-value.ts";

/**
 * One case: a text read as `kind` at `now`, with the value expected (`null`
 * for "states none"), or a column read by an `auto` sort key, with the kind
 * expected.
 */
export type AutomationStudioRecordValueReadingCase =
  | { kind: "number"; text: string; now: number; expected: number | null }
  | { kind: "date"; text: string; now: number; expected: number | null }
  | { kind: "text"; text: string; now: number; expected: string | null }
  | { kind: "auto"; column: readonly string[]; now: number; expected: AutomationStudioRecordSortReading };

const NOW = Date.UTC(2026, 9, 6, 12);
const DAY = 86_400_000;

const number = (text: string, expected: number | null): AutomationStudioRecordValueReadingCase => ({ kind: "number", text, now: NOW, expected });
const date = (text: string, expected: number | null): AutomationStudioRecordValueReadingCase => ({ kind: "date", text, now: NOW, expected });
const auto = (column: readonly string[], expected: AutomationStudioRecordSortReading): AutomationStudioRecordValueReadingCase => ({ kind: "auto", column, now: NOW, expected });

export const AUTOMATION_STUDIO_RECORD_VALUE_READING_CASES: readonly AutomationStudioRecordValueReadingCase[] = Object.freeze([
  number("$29.99", 29.99),
  number("$1,299.00", 1299),
  number("16.00 USD", 16),
  number("3.7 out of 5 stars", 3.7),
  number("£65,000 to £80,000", 65000),
  number("EUR 169,00", 169),
  number("1.165,00 €", 1165),
  number("16,49 €", 16.49),
  number("1.165.000", 1165000),
  number("£1,165.00", 1165),
  number("1,165", 1165),
  number("1.165", 1.165),
  number("-5 degrees", -5),
  number("Aisha Khan and 4 other mutual friends", 5),
  number("Liked by Sam and 12 others", 13),
  number("12 and 4 others", 12),
  number("Price on request", null),
  // A magnitude written on the number is part of it (t510): "72k" is 72000, not 72.
  number("£72k – £80k per annum", 72000),
  number("72K", 72000),
  number("$1.2m", 1200000),
  number("3.5M views", 3500000),
  number("€1,5k", 1500),
  number("4 thousand", 4000),
  number("1.5 million", 1500000),
  number("72kg", 72),
  number("5 km away", 5),
  number("10 m cable", 10),
  // A bare m is minutes, metres or million, so it is million only with a currency symbol on the number, a decimal
  // point, or the word (supervisor, t510).
  number("3m ago", 3),
  number("10 m", 10),
  number("10m", 10),
  number("£3m", 3000000),
  number("€2M", 2000000),
  number("1.5m", 1500000),
  date("3 days ago", NOW - 3 * DAY),
  date("30+ days ago", NOW - 30 * DAY),
  date("an hour ago", NOW - 3_600_000),
  date("Posted 2 weeks ago", NOW - 14 * DAY),
  date("yesterday", NOW - DAY),
  date("Posted yesterday", NOW - DAY),
  date("just posted", NOW),
  date("Today", NOW),
  date("Apply today", null),
  date("2026-09-12", Date.UTC(2026, 8, 12)),
  date("Updated 2026-09-12T08:30", Date.UTC(2026, 8, 12, 8, 30)),
  date("12 Sep 2026", Date.UTC(2026, 8, 12)),
  date("Sep 12", Date.UTC(2026, 8, 12)),
  // A date with no year is the occurrence nearest `now` (supervisor, t510): one ahead of it is this year's or next
  // year's, never last year's. Until t510 it was the latest not after `now` plus a day, so "Dec 25" was last year's.
  date("Dec 25", Date.UTC(2026, 11, 25)),
  date("Feb 3", Date.UTC(2027, 1, 3)),
  date("5 Oct", Date.UTC(2026, 9, 5)),
  date("Apr 10", Date.UTC(2026, 3, 10)),
  date("Apr 2", Date.UTC(2027, 3, 2)),
  date("13/02/2026", Date.UTC(2026, 1, 13)),
  date("02/03/2026", Date.UTC(2026, 1, 3)),
  date("Senior engineer", null),
  // The time of day a date states is kept (t510, F6): two values on one day order by their times.
  date("(Tue 22 Sep, 14:00)", Date.UTC(2026, 8, 22, 14)),
  date("(Tue 22 Sep, 08:00)", Date.UTC(2026, 8, 22, 8)),
  date("Sep 12, 2026 at 2:30 pm", Date.UTC(2026, 8, 12, 14, 30)),
  date("02/03/2026 9am", Date.UTC(2026, 1, 3, 9)),
  date("12 Sep 2026 12:15 AM", Date.UTC(2026, 8, 12, 0, 15)),
  date("Today 14:00", Date.UTC(2026, 9, 6, 14)),
  date("Tomorrow, 09:30", Date.UTC(2026, 9, 7, 9, 30)),
  date("14:00", null),
  // A time left is the instant it runs out, measured on from `now` (t510, F6).
  date("1d 0h left", NOW + DAY),
  date("5h 12m left", NOW + 5 * 3_600_000 + 12 * 60_000),
  date("3 days left", NOW + 3 * DAY),
  date("2 days, 4 hours remaining", NOW + 2 * DAY + 4 * 3_600_000),
  date("Ends in 45 min", NOW + 45 * 60_000),
  date("Only 2 left", null),
  { kind: "text", text: "  Gamma \n  Ray ", now: NOW, expected: "Gamma Ray" },
  { kind: "text", text: "   ", now: NOW, expected: null },
  auto(["3 days ago", "yesterday", "$5"], "date"),
  auto(["$5", "$7", "n/a"], "number"),
  auto(["apple", "banana", "$3"], "text"),
  auto(["$5", "n/a"], "text"),
  auto(["1d 0h left", "5h 12m left", "2d 3h left"], "date"),
  auto([], "text")
]);

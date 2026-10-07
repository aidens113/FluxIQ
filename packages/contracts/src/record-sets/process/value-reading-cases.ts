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
  date("Dec 25", Date.UTC(2025, 11, 25)),
  date("13/02/2026", Date.UTC(2026, 1, 13)),
  date("02/03/2026", Date.UTC(2026, 1, 3)),
  date("Senior engineer", null),
  { kind: "text", text: "  Gamma \n  Ray ", now: NOW, expected: "Gamma Ray" },
  { kind: "text", text: "   ", now: NOW, expected: null },
  auto(["3 days ago", "yesterday", "$5"], "date"),
  auto(["$5", "$7", "n/a"], "number"),
  auto(["apple", "banana", "$3"], "text"),
  auto(["$5", "n/a"], "text"),
  auto([], "text")
]);

// A `where` condition's `within` (t800, K1): `{field, within: "7 days"}` keeps
// the rows whose value states a date from 7 days before the run's `now` up to
// `now`, both ends included: the instants [now - 7 days, now]. A row dated
// later than `now` (a "Tomorrow", a time left) is not within it.
//
// One whole number and one unit of `AUTOMATION_STUDIO_RECORD_CONDITION_WITHIN_UNITS`,
// singular or plural ("1 day", "48 hours", "2 weeks"). It is the pair of
// relative bounds `atLeast: "<n> <unit> ago"` and `atMost: "now"`
// (`date-bound.ts`) said in one phrase, and reads the row's date the way they
// do: a row stating no date it can read fails it whatever `not` says
// (`condition/holds.ts`), and the run-end account counts it (`undated`).

import { collapsedText } from "./cell-text.ts";
import { AUTOMATION_STUDIO_RECORD_CONDITION_UNIT_MS } from "./processing-vocabulary.ts";

/** `<n> <unit>`: a whole number from 1, then one unit, singular or plural. */
const WITHIN = /^([1-9]\d{0,5}) (minute|hour|day|week)s?$/u;

/** The span a `within` keeps, `[from, to]` in epoch milliseconds at `now`, or `undefined` for one that names no span (header). */
export function readAutomationStudioRecordConditionWithin(written: string, now: number = Date.now()): { from: number; to: number } | undefined {
  const within = WITHIN.exec(collapsedText(written).toLowerCase());
  if (within === null) return undefined;
  return { from: now - Number(within[1]) * AUTOMATION_STUDIO_RECORD_CONDITION_UNIT_MS[within[2] as keyof typeof AUTOMATION_STUDIO_RECORD_CONDITION_UNIT_MS], to: now };
}

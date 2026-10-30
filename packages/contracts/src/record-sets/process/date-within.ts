// A `where` condition's `within` (t800, K1; whole days G1): `{field, within:
// "7 days"}` keeps the rows whose value states a date from 7 days before the
// run's `now` up to `now`, both ends included. A value that states a time
// ("2026-10-22 09:00", "5 hours ago") is judged by the instants [now - 7 days,
// now]. A value that states only a day ("2026-10-22", "22 Oct 2026", "Posted
// yesterday", "3 days ago") is judged by whole calendar days: with now at
// 15:00 on 29 October, "within 7 days" keeps a row dated 22 October, since the
// span is the day of now - 7 days through the day of now. Only the units day
// and week count whole days; minutes and hours stay instants for every value.
// A row dated later than `now` (a "Tomorrow", a time left, a day after now's)
// is not within it.
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

/**
 * The span a `within` keeps, `[from, to]` in epoch milliseconds at `now`, or
 * `undefined` for one that names no span (header). `wholeDays` is true for a
 * span in days or weeks: a value stating only a day is then judged by its day
 * against the days of `from` and `to` (`condition/holds.ts`).
 */
export function readAutomationStudioRecordConditionWithin(written: string, now: number = Date.now()): { from: number; to: number; wholeDays: boolean } | undefined {
  const within = WITHIN.exec(collapsedText(written).toLowerCase());
  if (within === null) return undefined;
  const unit = within[2] as keyof typeof AUTOMATION_STUDIO_RECORD_CONDITION_UNIT_MS;
  return { from: now - Number(within[1]) * AUTOMATION_STUDIO_RECORD_CONDITION_UNIT_MS[unit], to: now, wholeDays: unit === "day" || unit === "week" };
}

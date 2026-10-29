// A `where` date bound as written (t790): the one day, or instant, a bound
// written as a date names.
//
// Run `run-mvswewhy-e4e469d4` asked for rows "on or after Saturday 19 September
// 2026". The bound a Flow writes for that is `{field, atLeast: "2026-09-19",
// as: "date"}`, and it must mean one day whenever and wherever it runs, so a
// bound is read only where it names its date outright: with its year, and
// never relative to the moment it is read. "2026-09-19", "19 September 2026",
// "Sep 19, 2026", "Saturday 19 September 2026" and "19/09/2026" are bounds;
// "Sep 19" (which year?), "3 days ago", "today" and "02/03/2026" (which month?)
// are not, and a condition carrying one is refused where it is written, never
// run as a filter that matches nothing.
//
// A bound with no time of day is its whole day (`wholeDay`): the row's own day
// is compared with it, so `atMost "2026-09-21"` keeps a row stated at 04:00 that
// day, and `atLeast` with `atMost` keep the days between, both included. A
// bound with a time ("2026-09-19 18:00") compares the instant. Every date is
// read as UTC, as the sort reads it (`read-date.ts`).

import { readAutomationStudioRecordConditionDate } from "./row-date.ts";

/** A bound written as a date: its instant, and whether it names a whole day (no time of day). */
export type AutomationStudioRecordConditionDateBound = { at: number; wholeDay: boolean };

const DAY_MS = 86_400_000;
/** Two moments far apart: a reading that is the same at both does not depend on when it is read. */
const EARLY = Date.UTC(2000, 0, 1);
const LATE = Date.UTC(2050, 6, 1);

/** The date a bound names, or `undefined` for a bound that names no one date on its own (header). */
export function readAutomationStudioRecordConditionDateBound(written: string): AutomationStudioRecordConditionDateBound | undefined {
  const at = readAutomationStudioRecordConditionDate(written, EARLY);
  if (at === undefined || readAutomationStudioRecordConditionDate(written, LATE) !== at) return undefined;
  return { at, wholeDay: at % DAY_MS === 0 };
}

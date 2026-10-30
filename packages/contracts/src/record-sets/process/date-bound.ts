// A `where` date bound as written (t790): the one day, or instant, a bound
// written as a date names.
//
// Run `run-mvswewhy-e4e469d4` asked for rows "on or after Saturday 19 September
// 2026". The bound a Flow writes for that is `{field, atLeast: "2026-09-19",
// as: "date"}`, and it must mean one day whenever and wherever it runs, so an
// absolute bound is read only where it names its date outright: with its year.
// "2026-09-19", "19 September 2026", "Sep 19, 2026", "Saturday 19 September
// 2026" and "19/09/2026" are bounds; "Sep 19" (which year?), "02/03/2026"
// (which month?) and "next week" are not, and a condition carrying one is
// refused where it is written, never run as a filter that matches nothing.
//
// **A bound may also be relative to the run's `now` (t800, K1).** A request for
// rows "from the last two days" means a different day on each run, and is said
// as `today`, `yesterday`, `now`, or `<n> <unit> ago` in a unit `within` takes
// (`processing-vocabulary.ts`): `{field, atLeast: "2 days ago"}`. Each is read
// against the `now` the condition is judged at (`condition/holds.ts`), exactly
// as a row's own "3 days ago" is read (`read-date.ts`). `today` and `yesterday`
// name their whole day; `now` and `<n> <unit> ago` name an instant, as the same
// words in a row do. A request that names a day ("on or after 19 September
// 2026") still needs an absolute bound: a relative word for it would drift a
// day each day the Flow runs. Nothing else relative is a bound: "Sep 19" with
// no year is a day the reader guesses the year of, not one `now` decides.
//
// A bound with no time of day is its whole day (`wholeDay`): the row's own day
// is compared with it, so `atMost "2026-09-21"` keeps a row stated at 04:00 that
// day, and `atLeast` with `atMost` keep the days between, both included. A
// bound with a time ("2026-09-19 18:00") compares the instant. Every date is
// read as UTC, as the sort reads it (`read-date.ts`).

import { collapsedText } from "./cell-text.ts";
import { AUTOMATION_STUDIO_RECORD_CONDITION_RELATIVE_DAYS, AUTOMATION_STUDIO_RECORD_CONDITION_UNIT_MS } from "./processing-vocabulary.ts";
import { readAutomationStudioRecordConditionDate } from "./row-date.ts";

/** A bound written as a date: its instant, and whether it names a whole day (no time of day). */
export type AutomationStudioRecordConditionDateBound = { at: number; wholeDay: boolean };

const DAY_MS = 86_400_000;
/** Two moments far apart: a reading that is the same at both does not depend on when it is read. */
const EARLY = Date.UTC(2000, 0, 1);
const LATE = Date.UTC(2050, 6, 1);

/** `<n> <unit> ago`: a whole number of one unit, singular or plural, "a" or "an" for one. */
const AGO = /^(\d{1,6}|an?) (minute|hour|day|week)s? ago$/u;
const DAY_WORDS: ReadonlySet<string> = new Set(AUTOMATION_STUDIO_RECORD_CONDITION_RELATIVE_DAYS);

/**
 * The date a bound names, or `undefined` for a bound that names no one date
 * (header). `now` is what a relative bound is read against; an absolute bound
 * names the same date whatever it is.
 */
export function readAutomationStudioRecordConditionDateBound(written: string, now: number = Date.now()): AutomationStudioRecordConditionDateBound | undefined {
  const at = readAutomationStudioRecordConditionDate(written, EARLY);
  if (at !== undefined && readAutomationStudioRecordConditionDate(written, LATE) === at) return { at, wholeDay: at % DAY_MS === 0 };
  return relativeBound(collapsedText(written).toLowerCase(), now);
}

/** A bound relative to `now` (header): a day word, or `<n> <unit> ago`. */
function relativeBound(words: string, now: number): AutomationStudioRecordConditionDateBound | undefined {
  if (DAY_WORDS.has(words)) {
    if (words === "now") return { at: now, wholeDay: false };
    const today = Math.floor(now / DAY_MS) * DAY_MS;
    return { at: words === "today" ? today : today - DAY_MS, wholeDay: true };
  }
  const ago = AGO.exec(words);
  if (ago === null) return undefined;
  const amount = /^\d/u.test(ago[1]!) ? Number(ago[1]) : 1;
  return { at: now - amount * AUTOMATION_STUDIO_RECORD_CONDITION_UNIT_MS[ago[2] as keyof typeof AUTOMATION_STUDIO_RECORD_CONDITION_UNIT_MS], wholeDay: false };
}

// The date a row's value states, as a `where` date bound reads it (t790).
//
// Run `run-mvswewhy-e4e469d4` asked for rows "on or after Saturday 19 September
// 2026" and had no way to say so: a bound read only numbers. A date bound reads
// the value with the sort's own date reader (`read-date.ts`), so "Monday 21
// September 2026 at 04:00", "21 Sep 2026", "2026-09-21", "Sep 21, 2026" and a
// relative "3 days ago" read alike in both places.
//
// One difference, and it is deliberate: a numeric date whose day and month
// could each be the other ("02/03/2026") states no date here. A sort only
// orders rows and reads such a date month first; a bound decides which rows
// are kept, and keeping a row on a guess at its month is a row kept wrongly
// with nothing to show for it. A numeric date is read only where one of its
// first two numbers cannot be a month, or both are the same ("21/09/2026",
// "09/21/2026", "05/05/2026").

import { readAutomationStudioRecordDate } from "./read-date.ts";

/** A numeric date, as the date reader reads one: day and month in either order, then the year. */
const NUMERIC = /\b(\d{1,2})[/.](\d{1,2})[/.](\d{4})\b/u;

/**
 * The instant a value states, in epoch milliseconds, for a date bound; or
 * `undefined` for a value that states none, or states a numeric date whose day
 * and month could be read either way (header).
 */
export function readAutomationStudioRecordConditionDate(text: string, now: number): number | undefined {
  const read = readAutomationStudioRecordDate(text, now);
  if (read === undefined) return undefined;
  const numeric = NUMERIC.exec(text);
  if (numeric === null) return read;
  // The same text with its day and month swapped reads the same only where the reading did not rest on which is which.
  const swapped = `${text.slice(0, numeric.index)}${numeric[2]}/${numeric[1]}/${numeric[3]}${text.slice(numeric.index + numeric[0].length)}`;
  return readAutomationStudioRecordDate(swapped, now) === read ? read : undefined;
}

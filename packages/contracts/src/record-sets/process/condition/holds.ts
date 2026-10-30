// Whether one `where` condition holds of one stored cell. The semantics are the
// downstream web domain's item condition (its `condition-match`) to the
// character, so a condition means the same rows at read time and at run end.
//
// - A condition comparing nothing asks whether the value is there.
// - A bound and a numeric `equals` read the first number the value states
//   (`readAutomationStudioRecordNumber`); a value with none fails them.
// - Text comparisons and a string `equals` ignore layout and case; a bare
//   `matches` source ignores case and `/source/flags` says what it says.
// - A missing value fails every comparison, and `not` inverts the whole verdict,
//   so "no case in the title" keeps a row with no title.
// - A date bound (t790, run `run-mvswewhy-e4e469d4`: "on or after Saturday 19
//   September 2026" written as a regex of three days) reads the date the value
//   states (`row-date.ts`) against the date the bound names
//   (`date-bound.ts`), the row's own day against a bound with no time
//   of day. A value stating no date it can read fails it **whatever `not`
//   says**: a row whose date is unknown is never kept as matching, and the
//   run-end account counts it (`process-rows.ts`, `undated`).
// - Relative to the run (t800, K1): a date bound written as `today`,
//   `yesterday`, `now` or `<n> <unit> ago` is read against `now`, and `within`
//   keeps the dates in the last `n` units up to `now` (`date-within.ts`; a value
//   stating only a day is judged by whole days there, G1). The
//   row's own "3 days ago" is read against the same `now`, so a relative value
//   and a relative bound agree wherever the condition is judged.

import { cellText, collapsedText, foldedText } from "../cell-text.ts";
import { automationStudioRecordConditionComparesDates } from "../compares-dates.ts";
import { readAutomationStudioRecordConditionDateBound } from "../date-bound.ts";
import { readAutomationStudioRecordConditionWithin } from "../date-within.ts";
import { automationStudioRecordDateStatesOnlyDay } from "../read-date.ts";
import { AUTOMATION_STUDIO_RECORD_CONDITION_BOUNDS, AUTOMATION_STUDIO_RECORD_CONDITION_TEXTS } from "../processing-vocabulary.ts";
import { readAutomationStudioRecordNumber } from "../read-number.ts";
import { readAutomationStudioRecordConditionDate } from "../row-date.ts";
import type { AutomationStudioRecordConditionTest, AutomationStudioRecordConditionValue } from "../types.ts";

type ConditionBound = (typeof AUTOMATION_STUDIO_RECORD_CONDITION_BOUNDS)[number];
type ConditionText = (typeof AUTOMATION_STUDIO_RECORD_CONDITION_TEXTS)[number];

/** One day, for a date bound naming a whole day. */
const DAY_MS = 86_400_000;

/** How far apart two numbers may be and still be equal. */
const EQUAL_WITHIN = 1e-9;

/** The longest pattern a condition may carry, and the most of a value's text one is run against. */
const PATTERN_CHARACTERS = 200;
const MATCHED_CHARACTERS = 2_000;

/** Flags a `/pattern/flags` form may name; `g` and `y` are accepted and dropped, since they carry state between rows. */
const PATTERN_FLAGS = "dimsuv";
const STATEFUL_FLAGS = "gy";
const DELIMITED_PATTERN = /^\/(.+)\/([a-z]*)$/su;

const BOUND_HOLDS: Record<ConditionBound, (value: number, bound: number) => boolean> = {
  atLeast: (value, bound) => value >= bound,
  atMost: (value, bound) => value <= bound,
  lessThan: (value, bound) => value < bound,
  greaterThan: (value, bound) => value > bound
};

const TEXT_HOLDS: Record<ConditionText, (text: string, written: string) => boolean> = {
  matches: (text, written) => {
    const pattern = automationStudioRecordConditionPattern(written);
    return pattern !== undefined && pattern.test(text.slice(0, MATCHED_CHARACTERS));
  },
  contains: (text, written) => foldedText(text).includes(foldedText(written)),
  startsWith: (text, written) => foldedText(text).startsWith(foldedText(written)),
  endsWith: (text, written) => foldedText(text).endsWith(foldedText(written))
};

/**
 * Whether a row whose cell for the condition's field is `cell` satisfies the
 * condition. The field itself is not read, so a condition naming none judges
 * the one value it is given; a blank string, `null` and `undefined` are all a
 * value that is not there. `now` is what a relative date in the value ("3 days
 * ago") and a relative bound or `within` are measured back from, for a date
 * bound; the run-end processing passes its own, and a read on the page reads at
 * the moment it reads unless its caller passes the run's.
 */
export function automationStudioRecordConditionHolds(condition: AutomationStudioRecordConditionTest, cell: unknown, now: number = Date.now()): boolean {
  // A date bound never keeps a row whose date it cannot read, `not` or no `not` (header, t790).
  if (automationStudioRecordConditionComparesDates(condition) && datedAt(cell, now) === undefined) return false;
  const held = valueHolds(condition, cell, now);
  return condition.not === true ? !held : held;
}

/** The regular expression a `matches` names, or `undefined` for one that cannot run. */
export function automationStudioRecordConditionPattern(written: string): RegExp | undefined {
  if (written.length === 0 || written.length > PATTERN_CHARACTERS) return undefined;
  const delimited = DELIMITED_PATTERN.exec(written);
  const source = delimited?.[1] ?? written;
  const asked = delimited?.[2] ?? "";
  if ([...asked].some((flag) => !PATTERN_FLAGS.includes(flag) && !STATEFUL_FLAGS.includes(flag))) return undefined;
  const flags = delimited === null ? "i" : [...asked].filter((flag) => !STATEFUL_FLAGS.includes(flag)).join("");
  try {
    return new RegExp(source, flags);
  } catch (error) {
    if (error instanceof SyntaxError) return undefined;
    throw error;
  }
}

function valueHolds(condition: AutomationStudioRecordConditionTest, cell: unknown, now: number): boolean {
  const value = cellText(cell);
  const bounds = AUTOMATION_STUDIO_RECORD_CONDITION_BOUNDS.filter((key) => condition[key] !== undefined);
  const texts = AUTOMATION_STUDIO_RECORD_CONDITION_TEXTS.filter((key) => condition[key] !== undefined);
  if (bounds.length === 0 && texts.length === 0 && condition.equals === undefined && condition.within === undefined) {
    return (value !== undefined) === (condition.is !== "absent");
  }
  if (value === undefined) return false;
  const number = typeof cell === "number" ? cell : readAutomationStudioRecordNumber(value);
  if (condition.within !== undefined && !withinHolds(condition.within, cell, now)) return false;
  if (bounds.length > 0) {
    if (automationStudioRecordConditionComparesDates(condition)) {
      if (!bounds.every((key) => dateBoundHolds(key, condition[key], cell, now))) return false;
    } else {
      if (number === undefined) return false;
      if (!bounds.every((key) => {
        const bound = condition[key];
        return typeof bound === "number" && BOUND_HOLDS[key](number, bound);
      })) return false;
    }
  }
  const text = collapsedText(value);
  for (const key of texts) {
    if (!anyOf(condition[key] as string | readonly string[]).some((entry) => TEXT_HOLDS[key](text, entry))) return false;
  }
  if (condition.equals !== undefined && !equalsHolds(anyOf(condition.equals), value, number)) return false;
  return true;
}

/** The instant a cell's value states for a date bound, or `undefined` for one that states none it can read. */
function datedAt(cell: unknown, now: number): number | undefined {
  const value = cellText(cell);
  return value === undefined ? undefined : readAutomationStudioRecordConditionDate(value, now);
}

/** Whether a date bound holds of the cell: the row's own day against a bound naming a whole day, else the instants (header). */
function dateBoundHolds(key: ConditionBound, written: unknown, cell: unknown, now: number): boolean {
  const bound = typeof written === "string" ? readAutomationStudioRecordConditionDateBound(written, now) : undefined;
  const at = datedAt(cell, now);
  if (bound === undefined || at === undefined) return false;
  return BOUND_HOLDS[key](bound.wholeDay ? Math.floor(at / DAY_MS) * DAY_MS : at, bound.at);
}

/** Whether the cell's date lies in the span a `within` keeps at `now`, both ends included (`date-within.ts`). */
function withinHolds(written: unknown, cell: unknown, now: number): boolean {
  const span = typeof written === "string" ? readAutomationStudioRecordConditionWithin(written, now) : undefined;
  const at = datedAt(cell, now);
  if (span === undefined || at === undefined) return false;
  // A value stating only a day, in a span of days, is judged by its day against the days of the span's ends (G1).
  if (span.wholeDays && automationStudioRecordDateStatesOnlyDay(cellText(cell) ?? "", now)) {
    const day = Math.floor(at / DAY_MS);
    return day >= Math.floor(span.from / DAY_MS) && day <= Math.floor(span.to / DAY_MS);
  }
  return at >= span.from && at <= span.to;
}

function equalsHolds(written: readonly AutomationStudioRecordConditionValue[], value: string, number: number | undefined): boolean {
  const text = foldedText(value);
  return written.some((entry) => (typeof entry === "number" ? number !== undefined && Math.abs(number - entry) <= EQUAL_WITHIN : foldedText(entry) === text));
}

function anyOf<T>(written: T | readonly T[]): readonly T[] {
  return Array.isArray(written) ? (written as readonly T[]) : [written as T];
}

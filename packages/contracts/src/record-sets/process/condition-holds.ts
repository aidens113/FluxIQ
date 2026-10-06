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

import { cellText, collapsedText, foldedText } from "./cell-text.ts";
import { AUTOMATION_STUDIO_RECORD_CONDITION_BOUNDS, AUTOMATION_STUDIO_RECORD_CONDITION_TEXTS } from "./processing-vocabulary.ts";
import { readAutomationStudioRecordNumber } from "./read-number.ts";
import type { AutomationStudioRecordCondition, AutomationStudioRecordConditionValue } from "./types.ts";

type ConditionBound = (typeof AUTOMATION_STUDIO_RECORD_CONDITION_BOUNDS)[number];
type ConditionText = (typeof AUTOMATION_STUDIO_RECORD_CONDITION_TEXTS)[number];

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

/** Whether a row whose cell for the condition's field is `cell` satisfies the condition. */
export function automationStudioRecordConditionHolds(condition: AutomationStudioRecordCondition, cell: unknown): boolean {
  const held = valueHolds(condition, cell);
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

function valueHolds(condition: AutomationStudioRecordCondition, cell: unknown): boolean {
  const value = cellText(cell);
  const bounds = AUTOMATION_STUDIO_RECORD_CONDITION_BOUNDS.filter((key) => condition[key] !== undefined);
  const texts = AUTOMATION_STUDIO_RECORD_CONDITION_TEXTS.filter((key) => condition[key] !== undefined);
  if (bounds.length === 0 && texts.length === 0 && condition.equals === undefined) {
    return (value !== undefined) === (condition.is !== "absent");
  }
  if (value === undefined) return false;
  const number = typeof cell === "number" ? cell : readAutomationStudioRecordNumber(value);
  if (bounds.length > 0) {
    if (number === undefined) return false;
    if (!bounds.every((key) => BOUND_HOLDS[key](number, condition[key] as number))) return false;
  }
  const text = collapsedText(value);
  for (const key of texts) {
    if (!anyOf(condition[key] as string | readonly string[]).some((entry) => TEXT_HOLDS[key](text, entry))) return false;
  }
  if (condition.equals !== undefined && !equalsHolds(anyOf(condition.equals), value, number)) return false;
  return true;
}

function equalsHolds(written: readonly AutomationStudioRecordConditionValue[], value: string, number: number | undefined): boolean {
  const text = foldedText(value);
  return written.some((entry) => (typeof entry === "number" ? number !== undefined && Math.abs(number - entry) <= EQUAL_WITHIN : foldedText(entry) === text));
}

function anyOf<T>(written: T | readonly T[]): readonly T[] {
  return Array.isArray(written) ? (written as readonly T[]) : [written as T];
}

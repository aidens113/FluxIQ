// Reads one untrusted `where` condition. Exact canonical keys only: the
// downstream domain's grammar reads a model's other spellings and writes the
// canonical one, so nothing else reaches a contract. What the domain's grammar
// refuses, this refuses: a bound that is not a finite number, an empty list, a
// blank text, a pattern that does not compile, and `is: "absent"` beside a
// comparison. `not: false` says nothing and is dropped.
//
// **A date bound (t790, run `run-mvswewhy-e4e469d4`).** A bound written as text
// is a date bound and must name one date on its own
// (`date-bound.ts`): its year written, or a word relative to the run's `now`
// (`today`, `yesterday`, `now`, `<n> <unit> ago`, t800), and no day and month
// that read either way. A `within` names one whole number of one unit
// (`date-within.ts`, t800) and is a date comparison like a date bound. One that
// does not is refused here, at plan time, never run as a filter that keeps
// nothing. A condition's bounds are all
// numbers or all dates, and `as` must name that kind. The canonical condition
// carries no `as`: a bound written as text is what marks a date bound, so `as`
// says what the bounds already say and is dropped, as `not: false` is -- the
// downstream domain's canonical condition, which carries none, is the same
// condition to the key.

import { isPlainRecord } from "../is-plain-record.ts";
import { readAutomationStudioRecordConditionDateBound } from "./date-bound.ts";
import { readAutomationStudioRecordConditionWithin } from "./date-within.ts";
import { automationStudioRecordConditionPattern } from "./condition/index.ts";
import {
  AUTOMATION_STUDIO_RECORD_CONDITION_BOUNDS,
  AUTOMATION_STUDIO_RECORD_CONDITION_PRESENCES,
  AUTOMATION_STUDIO_RECORD_CONDITION_TEXTS,
  AUTOMATION_STUDIO_RECORD_CONDITION_TYPES
} from "./processing-vocabulary.ts";
import type { AutomationStudioRecordCondition, AutomationStudioRecordConditionValue } from "./types.ts";

const CONDITION_KEYS: ReadonlySet<string> = new Set([
  "field",
  "is",
  ...AUTOMATION_STUDIO_RECORD_CONDITION_BOUNDS,
  "within",
  "as",
  "equals",
  ...AUTOMATION_STUDIO_RECORD_CONDITION_TEXTS,
  "not"
]);
const PRESENCES: ReadonlySet<unknown> = new Set(AUTOMATION_STUDIO_RECORD_CONDITION_PRESENCES);
const TYPES: ReadonlySet<unknown> = new Set(AUTOMATION_STUDIO_RECORD_CONDITION_TYPES);

/** The condition as fresh objects, or `null` for one that cannot run. The field id is checked against the schema by the caller. */
export function parseAutomationStudioRecordCondition(value: unknown): AutomationStudioRecordCondition | null {
  if (!isPlainRecord(value) || !Object.keys(value).every((key) => CONDITION_KEYS.has(key))) return null;
  if (typeof value.field !== "string") return null;
  const condition: AutomationStudioRecordCondition = { field: value.field };
  if (value.is !== undefined) {
    if (!PRESENCES.has(value.is)) return null;
    condition.is = value.is as NonNullable<AutomationStudioRecordCondition["is"]>;
  }
  let compares = false;
  const kinds = new Set<"number" | "date">();
  for (const key of AUTOMATION_STUDIO_RECORD_CONDITION_BOUNDS) {
    const bound = value[key];
    if (bound === undefined) continue;
    if (typeof bound === "string") {
      if (readAutomationStudioRecordConditionDateBound(bound) === undefined) return null;
      kinds.add("date");
    } else if (typeof bound === "number" && Number.isFinite(bound)) kinds.add("number");
    else return null;
    condition[key] = bound;
    compares = true;
  }
  if (value.within !== undefined) {
    if (typeof value.within !== "string" || readAutomationStudioRecordConditionWithin(value.within) === undefined) return null;
    condition.within = value.within;
    kinds.add("date");
    compares = true;
  }
  // One kind of bound, and `as` naming that kind (header, t790).
  if (kinds.size > 1) return null;
  if (value.as !== undefined && (!TYPES.has(value.as) || !kinds.has(value.as as "number" | "date"))) return null;
  if (value.equals !== undefined) {
    const equals = oneOrMany(value.equals, isComparedValue);
    if (equals === null) return null;
    condition.equals = equals;
    compares = true;
  }
  for (const key of AUTOMATION_STUDIO_RECORD_CONDITION_TEXTS) {
    if (value[key] === undefined) continue;
    const texts = oneOrMany(value[key], key === "matches" ? isPattern : isText);
    if (texts === null) return null;
    condition[key] = texts;
    compares = true;
  }
  if (value.not !== undefined) {
    if (typeof value.not !== "boolean") return null;
    if (value.not) condition.not = true;
  }
  if (condition.is === "absent" && compares) return null;
  return condition;
}

/** One accepted value, or a non-empty list of them, copied; `null` when any entry is refused. */
function oneOrMany<T>(value: unknown, accepts: (entry: unknown) => entry is T): T | T[] | null {
  if (!Array.isArray(value)) return accepts(value) ? value : null;
  if (value.length === 0 || !value.every(accepts)) return null;
  return [...(value as T[])];
}

function isText(entry: unknown): entry is string {
  return typeof entry === "string" && entry.trim() !== "";
}

function isPattern(entry: unknown): entry is string {
  return isText(entry) && automationStudioRecordConditionPattern(entry) !== undefined;
}

function isComparedValue(entry: unknown): entry is AutomationStudioRecordConditionValue {
  return (typeof entry === "number" && Number.isFinite(entry)) || isText(entry);
}

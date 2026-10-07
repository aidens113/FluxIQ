// Reads one untrusted `where` condition. Exact canonical keys only: the
// downstream domain's grammar reads a model's other spellings and writes the
// canonical one, so nothing else reaches a contract. What the domain's grammar
// refuses, this refuses: a bound that is not a finite number, an empty list, a
// blank text, a pattern that does not compile, and `is: "absent"` beside a
// comparison. `not: false` says nothing and is dropped.

import { isPlainRecord } from "../is-plain-record.ts";
import { automationStudioRecordConditionPattern } from "./condition-holds.ts";
import {
  AUTOMATION_STUDIO_RECORD_CONDITION_BOUNDS,
  AUTOMATION_STUDIO_RECORD_CONDITION_PRESENCES,
  AUTOMATION_STUDIO_RECORD_CONDITION_TEXTS
} from "./processing-vocabulary.ts";
import type { AutomationStudioRecordCondition, AutomationStudioRecordConditionValue } from "./types.ts";

const CONDITION_KEYS: ReadonlySet<string> = new Set([
  "field",
  "is",
  ...AUTOMATION_STUDIO_RECORD_CONDITION_BOUNDS,
  "equals",
  ...AUTOMATION_STUDIO_RECORD_CONDITION_TEXTS,
  "not"
]);
const PRESENCES: ReadonlySet<unknown> = new Set(AUTOMATION_STUDIO_RECORD_CONDITION_PRESENCES);

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
  for (const key of AUTOMATION_STUDIO_RECORD_CONDITION_BOUNDS) {
    const bound = value[key];
    if (bound === undefined) continue;
    if (typeof bound !== "number" || !Number.isFinite(bound)) return null;
    condition[key] = bound;
    compares = true;
  }
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

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
//
// **A refused condition says why (t1070).** Run `run-mwyg0x66-4d561a42` was
// refused `record_output.process_invalid_condition` fourteen times and told
// nothing else, so it could not change what was wrong.
// `readAutomationStudioRecordCondition` reads a condition as the parser does,
// and for one that cannot run gives every rule it broke: the operator it is
// about and why, quoting keys and Core's own rules, never a bound, a text or a
// pattern. The parser is that reading less the reasons, so the two cannot
// disagree.

import { isPlainRecord } from "../is-plain-record.ts";
import { readAutomationStudioRecordConditionDateBound } from "./date-bound.ts";
import { readAutomationStudioRecordConditionWithin } from "./date-within.ts";
import { readAutomationStudioRecordConditionPattern } from "./condition/index.ts";
import {
  AUTOMATION_STUDIO_RECORD_CONDITION_BOUNDS,
  AUTOMATION_STUDIO_RECORD_CONDITION_PRESENCES,
  AUTOMATION_STUDIO_RECORD_CONDITION_TEXTS,
  AUTOMATION_STUDIO_RECORD_CONDITION_TYPES,
  AUTOMATION_STUDIO_RECORD_CONDITION_WITHIN_UNITS
} from "./processing-vocabulary.ts";
import type { AutomationStudioRecordCondition } from "./types.ts";

const CONDITION_KEYS: readonly string[] = [
  "field",
  "is",
  ...AUTOMATION_STUDIO_RECORD_CONDITION_BOUNDS,
  "within",
  "as",
  "equals",
  ...AUTOMATION_STUDIO_RECORD_CONDITION_TEXTS,
  "not"
];
const KEYS: ReadonlySet<string> = new Set(CONDITION_KEYS);
const PRESENCES: ReadonlySet<unknown> = new Set(AUTOMATION_STUDIO_RECORD_CONDITION_PRESENCES);
const TYPES: ReadonlySet<unknown> = new Set(AUTOMATION_STUDIO_RECORD_CONDITION_TYPES);
/** A key a sentence may name: identifier characters only. */
const NAMEABLE = /^[A-Za-z0-9_.$@-]{1,64}$/u;

const DATE_TEXT = "written as text, so it is a date bound, and it names no one date. Write a number bound as a number; a date bound as one date with its year, as 2026-10-01 or 1 October 2026, or as today, yesterday, now or <n> minutes, hours, days or weeks ago.";

/** One rule a condition broke: the operator it is about, where one, and why. */
export type AutomationStudioRecordConditionRefusalReason = { operator?: string; reason: string };

/** A condition read: the condition as fresh objects, or the field it names (where it names one) and every rule it broke. */
export type AutomationStudioRecordConditionReading =
  | { ok: true; condition: AutomationStudioRecordCondition }
  | { ok: false; field?: string; reasons: AutomationStudioRecordConditionRefusalReason[] };

/** The condition as fresh objects, or `null` for one that cannot run. The field id is checked against the schema by the caller. */
export function parseAutomationStudioRecordCondition(value: unknown): AutomationStudioRecordCondition | null {
  const read = readAutomationStudioRecordCondition(value);
  return read.ok ? read.condition : null;
}

/** The condition read as the parser reads it, with every rule a refused one broke (header). */
export function readAutomationStudioRecordCondition(value: unknown): AutomationStudioRecordConditionReading {
  if (!isPlainRecord(value)) return { ok: false, reasons: [{ reason: "not an object; a condition is {field, then what it compares}." }] };
  const reasons: AutomationStudioRecordConditionRefusalReason[] = [];
  const refuse = (reason: string, operator?: string): void => {
    reasons.push(operator === undefined ? { reason } : { operator, reason });
  };
  const unknown = Object.keys(value).filter((key) => !KEYS.has(key));
  if (unknown.length) refuse(`takes no key ${named(unknown)}; a condition takes ${CONDITION_KEYS.join(", ")}.`);
  const field = typeof value.field === "string" ? value.field : undefined;
  if (field === undefined) refuse("names no field: field is the id of a column the rows hold, as text.");
  const condition: AutomationStudioRecordCondition = { field: field ?? "" };
  if (value.is !== undefined) {
    if (!PRESENCES.has(value.is)) refuse(`must be ${AUTOMATION_STUDIO_RECORD_CONDITION_PRESENCES.join(" or ")}.`, "is");
    else condition.is = value.is as NonNullable<AutomationStudioRecordCondition["is"]>;
  }
  let compares = false;
  const kinds = new Set<"number" | "date">();
  for (const key of AUTOMATION_STUDIO_RECORD_CONDITION_BOUNDS) {
    const bound = value[key];
    if (bound === undefined) continue;
    if (typeof bound === "string") {
      if (readAutomationStudioRecordConditionDateBound(bound) === undefined) {
        refuse(DATE_TEXT, key);
        continue;
      }
      kinds.add("date");
    } else if (typeof bound === "number" && Number.isFinite(bound)) kinds.add("number");
    else {
      refuse("must be a finite number, or a date written as text.", key);
      continue;
    }
    condition[key] = bound;
    compares = true;
  }
  if (value.within !== undefined) {
    if (typeof value.within !== "string" || readAutomationStudioRecordConditionWithin(value.within) === undefined) {
      refuse(`must be text naming one whole number of one unit, as "<n> ${AUTOMATION_STUDIO_RECORD_CONDITION_WITHIN_UNITS.join("|")}".`, "within");
    } else {
      condition.within = value.within;
      kinds.add("date");
      compares = true;
    }
  }
  // One kind of bound, and `as` naming that kind (header, t790).
  if (kinds.size > 1) refuse("mixes number and date bounds; one condition's bounds are all numbers or all dates.");
  if (value.as !== undefined) {
    if (!TYPES.has(value.as)) refuse(`must be ${AUTOMATION_STUDIO_RECORD_CONDITION_TYPES.join(" or ")}.`, "as");
    else if (!kinds.has(value.as as "number" | "date")) {
      refuse(`says ${String(value.as)}, and ${kinds.size ? `the condition's bounds are ${[...kinds].join(" and ")}s` : "the condition has no bound"}; as names the kind its bounds are, and may be left out.`, "as");
    }
  }
  if (value.equals !== undefined) {
    const equals = oneOrMany(value.equals, comparedRefusal);
    if (!equals.ok) refuse(equals.reason, "equals");
    else {
      condition.equals = equals.value;
      compares = true;
    }
  }
  for (const key of AUTOMATION_STUDIO_RECORD_CONDITION_TEXTS) {
    if (value[key] === undefined) continue;
    const texts = oneOrMany<string>(value[key], key === "matches" ? patternRefusal : textRefusal);
    if (!texts.ok) refuse(texts.reason, key);
    else {
      condition[key] = texts.value;
      compares = true;
    }
  }
  if (value.not !== undefined) {
    if (typeof value.not !== "boolean") refuse("must be true or false.", "not");
    else if (value.not) condition.not = true;
  }
  if (condition.is === "absent" && compares) refuse("is absent beside a comparison, and a missing value fails every comparison: keep one or the other.", "is");
  if (reasons.length) return field === undefined ? { ok: false, reasons } : { ok: false, field, reasons };
  return { ok: true, condition };
}

/** One accepted value, or a non-empty list of them, copied; else why, naming the list entry where it is one. */
function oneOrMany<T extends string | number>(value: unknown, refusal: (entry: unknown) => string | undefined): { ok: true; value: T | T[] } | { ok: false; reason: string } {
  if (!Array.isArray(value)) {
    const reason = refusal(value);
    return reason === undefined ? { ok: true, value: value as T } : { ok: false, reason };
  }
  if (value.length === 0) return { ok: false, reason: "an empty list; a list holds at least one entry, and holds when any one does." };
  for (const [index, entry] of value.entries()) {
    const reason = refusal(entry);
    if (reason !== undefined) return { ok: false, reason: `entry ${index + 1} of the list: ${reason}` };
  }
  return { ok: true, value: [...(value as T[])] };
}

function textRefusal(entry: unknown): string | undefined {
  return typeof entry === "string" && entry.trim() !== "" ? undefined : "must be nonblank text, or a nonempty list of nonblank texts.";
}

function patternRefusal(entry: unknown): string | undefined {
  if (typeof entry !== "string" || entry.trim() === "") return "must be a nonblank JavaScript regular expression, or a nonempty list of them.";
  const read = readAutomationStudioRecordConditionPattern(entry);
  return read.ok ? undefined : read.reason;
}

function comparedRefusal(entry: unknown): string | undefined {
  return (typeof entry === "number" && Number.isFinite(entry)) || (typeof entry === "string" && entry.trim() !== "") ? undefined : "must be nonblank text, a finite number, or a nonempty list of them.";
}

/** Keys a sentence may name, each quoted; one that is not an identifier is counted, never quoted. */
function named(keys: readonly string[]): string {
  const shown = keys.filter((key) => NAMEABLE.test(key)).map((key) => JSON.stringify(key));
  const unnamed = keys.length - shown.length;
  return [...shown, ...(unnamed ? [`${unnamed} key${unnamed === 1 ? "" : "s"} that ${unnamed === 1 ? "is" : "are"} not an identifier`] : [])].join(", ");
}

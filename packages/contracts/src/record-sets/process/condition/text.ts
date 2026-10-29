// A `where` condition in words, for an account that says which rows it left out
// (t493): its field, then each comparison it names with the value written, as
// `name not contains "Spare Strap"` or `price atLeast 10 and lessThan 50`. A
// condition naming no comparison asks whether the value is there. `not` inverts
// the whole condition, so it goes before the comparisons, bracketing two or more.
//
// A date bound says so (t790, run `run-mvswewhy-e4e469d4`): `due atLeast
// "2026-09-19" as a date`, so no reader of an account takes a bound written as
// a date for text or a number. A `within` (t800) says its span the same way:
// `posted within "7 days" as a date`.

import { automationStudioRecordConditionComparesDates } from "../compares-dates.ts";
import { AUTOMATION_STUDIO_RECORD_CONDITION_BOUNDS, AUTOMATION_STUDIO_RECORD_CONDITION_TEXTS } from "../processing-vocabulary.ts";
import type { AutomationStudioRecordCondition } from "../types.ts";

/** The condition as words: its field, `not` where it says so, and every comparison with its written value. */
export function automationStudioRecordConditionText(condition: AutomationStudioRecordCondition): string {
  const compared = [...AUTOMATION_STUDIO_RECORD_CONDITION_BOUNDS, "within" as const, "equals" as const, ...AUTOMATION_STUDIO_RECORD_CONDITION_TEXTS]
    .filter((key) => condition[key] !== undefined)
    .map((key) => `${key} ${written(condition[key]!)}`);
  const dated = automationStudioRecordConditionComparesDates(condition) ? " as a date" : "";
  const said = compared.length ? `${compared.join(" and ")}${dated}` : `is ${condition.is ?? "present"}`;
  if (condition.not !== true) return `${condition.field} ${said}`;
  return `${condition.field} not ${compared.length > 1 ? `(${said})` : said}`;
}

function written(value: string | number | readonly (string | number)[]): string {
  return Array.isArray(value) ? `[${value.map((entry) => JSON.stringify(entry)).join(", ")}]` : JSON.stringify(value);
}

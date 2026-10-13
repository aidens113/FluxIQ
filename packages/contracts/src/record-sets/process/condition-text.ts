// A `where` condition in words, for an account that says which rows it left out
// (t493): its field, then each comparison it names with the value written, as
// `name not contains "Spare Strap"` or `price atLeast 10 and lessThan 50`. A
// condition naming no comparison asks whether the value is there. `not` inverts
// the whole condition, so it goes before the comparisons, bracketing two or more.

import { AUTOMATION_STUDIO_RECORD_CONDITION_BOUNDS, AUTOMATION_STUDIO_RECORD_CONDITION_TEXTS } from "./processing-vocabulary.ts";
import type { AutomationStudioRecordCondition } from "./types.ts";

/** The condition as words: its field, `not` where it says so, and every comparison with its written value. */
export function automationStudioRecordConditionText(condition: AutomationStudioRecordCondition): string {
  const compared = [...AUTOMATION_STUDIO_RECORD_CONDITION_BOUNDS, "equals" as const, ...AUTOMATION_STUDIO_RECORD_CONDITION_TEXTS]
    .filter((key) => condition[key] !== undefined)
    .map((key) => `${key} ${written(condition[key]!)}`);
  const said = compared.length ? compared.join(" and ") : `is ${condition.is ?? "present"}`;
  if (condition.not !== true) return `${condition.field} ${said}`;
  return `${condition.field} not ${compared.length > 1 ? `(${said})` : said}`;
}

function written(value: string | number | readonly (string | number)[]): string {
  return Array.isArray(value) ? `[${value.map((entry) => JSON.stringify(entry)).join(", ")}]` : JSON.stringify(value);
}

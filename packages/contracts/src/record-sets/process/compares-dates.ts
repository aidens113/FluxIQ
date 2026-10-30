// Whether a `where` condition's bounds compare dates (t790, run
// `run-mvswewhy-e4e469d4`): it says `as: "date"`, a bound is written as text,
// which only a date bound is, or it carries a `within` (t800, K1). The one test
// every reader of a condition asks, so the evaluator, the wording and Core's
// readings never decide it differently.

import { AUTOMATION_STUDIO_RECORD_CONDITION_BOUNDS } from "./processing-vocabulary.ts";
import type { AutomationStudioRecordConditionTest } from "./types.ts";

/** Whether the condition's bounds compare the date its value states rather than the number. */
export function automationStudioRecordConditionComparesDates(condition: AutomationStudioRecordConditionTest): boolean {
  return condition.as === "date" || condition.within !== undefined || AUTOMATION_STUDIO_RECORD_CONDITION_BOUNDS.some((key) => typeof condition[key] === "string");
}

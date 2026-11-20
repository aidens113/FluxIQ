// An `anyOf` group of a processing (t970): it holds of a row when any one of
// its conditions holds of the row's cell for that condition's column, each
// condition judged exactly as a `where` condition is (`condition/holds.ts`).
// Together with `where`, whose conditions must all hold, it says "this or that"
// across columns, which a list inside one condition (any of its values, one
// column) cannot.

import { cellOf } from "./cell-text.ts";
import { automationStudioRecordConditionHolds, automationStudioRecordConditionText } from "./condition/index.ts";
import type { AutomationStudioRecordCondition } from "./types.ts";

/** Whether any of the group's conditions holds of the row's values. */
export function automationStudioRecordAnyOfHolds(group: readonly AutomationStudioRecordCondition[], values: Readonly<Record<string, unknown>>, now: number): boolean {
  return group.some((condition) => automationStudioRecordConditionHolds(condition, cellOf(values, condition.field), now));
}

/** The group in words: `any of (plan contains "pro"; seats atLeast 10)`. */
export function automationStudioRecordAnyOfText(group: readonly AutomationStudioRecordCondition[]): string {
  return `any of (${group.map(automationStudioRecordConditionText).join("; ")})`;
}

/** The columns a group reads, each once, in the order named. */
export function automationStudioRecordAnyOfFields(group: readonly AutomationStudioRecordCondition[]): string[] {
  return [...new Set(group.map((condition) => condition.field))];
}

// A processing's `anyOf` (t970, read as alternatives since t1074): a list of
// groups, and a row passes it when every condition of any one group holds of
// the row, each condition judged exactly as a `where` condition is
// (`condition/holds.ts`). `[[a], [b, c]]` reads "a, or else b and c": each group
// is one way a row qualifies. Together with `where`, whose conditions must all
// hold, it says "this or that" across columns, which a list inside one
// condition (any of its values, one column) cannot.
//
// **Why alternatives, not "any condition of each group".** Until t1074 every
// group was its own filter holding when any one of its conditions held, and
// every group had to hold. All 31 recorded declarations that used `anyOf`
// (runs run-mwyfoz8o-507c92f6, run-mwyg0x66-4d561a42, run-mwyn25dg-3ba0b41c)
// were written the other way: one group per way a row qualifies, such as a
// price in the site's own currency in one group and the site's estimate of a
// foreign price in another, each saying why "or". Read as "every group holds",
// each such declaration kept no row at all (a row priced in one currency has no
// estimate) or withheld the answer for a value one group could not read while
// another group decided the row. So the grammar now means what the models
// wrote, and a row is decided by the groups that have evidence for it
// (`readiness/filters.ts`).

import { cellOf } from "./cell-text.ts";
import { automationStudioRecordConditionHolds, automationStudioRecordConditionText } from "./condition/index.ts";
import type { AutomationStudioRecordCondition } from "./types.ts";

/** Whether every condition of any one group holds of the row's values (header). */
export function automationStudioRecordAnyOfHolds(groups: readonly (readonly AutomationStudioRecordCondition[])[], values: Readonly<Record<string, unknown>>, now: number): boolean {
  return groups.some((group) => group.every((condition) => automationStudioRecordConditionHolds(condition, cellOf(values, condition.field), now)));
}

/** The alternatives in words: `any of (plan contains "pro"; seats atLeast 10 and region equals "eu")`. */
export function automationStudioRecordAnyOfText(groups: readonly (readonly AutomationStudioRecordCondition[])[]): string {
  return `any of (${groups.map((group) => group.map(automationStudioRecordConditionText).join(" and ")).join("; ")})`;
}

/** The columns the conditions read, each once, in the order named; pass `anyOf.flat()` for the whole filter. */
export function automationStudioRecordAnyOfFields(conditions: readonly AutomationStudioRecordCondition[]): string[] {
  return [...new Set(conditions.map((condition) => condition.field))];
}

// The rows each repeated step's passes are named by (t252 D6): for every step
// inside a span that repeats, the labels of the rows the span's `over` step
// returned in the test, taken from what the judge is already shown of that
// step -- its `readRows.rows`, screened by `./read-rows.ts`. Pass n is row n:
// the walker runs the span once per row of that read's answer, in its order.
//
// Nothing here reads a row's value; a label the screen withheld stays withheld.
// A span over a check (a while span) has no rows, and its passes carry numbers
// only.

import type { JsonValue } from "../../../../../core/index.ts";
import {
  automationStudioFlowDraftStepId,
  automationStudioFlowDraftStepIsProposed,
  type AutomationStudioFlowDraftStep
} from "../../flow-draft/index.ts";
import { AUTOMATION_STUDIO_BUILD_TEST_READ_ROWS_KEY } from "./read-rows.ts";

/**
 * Each span member's row labels, by the member's id: `observedOf` gives what
 * the judge is shown of a step, by its id. A member whose list named no rows
 * is left out.
 */
export function automationStudioBuildTestSpanRows(
  steps: readonly AutomationStudioFlowDraftStep[],
  observedOf: (stepId: string) => JsonValue | undefined
): Map<string, readonly string[]> {
  const rows = new Map<string, readonly string[]>();
  for (const step of steps) {
    if (step.routing?.kind !== "repeat") continue;
    const labels = rowLabels(observedOf(step.routing.over));
    if (!labels) continue;
    for (const member of spanMembers(steps, step, step.routing.through)) if (!rows.has(member)) rows.set(member, labels);
  }
  return rows;
}

/**
 * The ids of a repeating span: this step through `through`, in draft order,
 * proposed steps only; just this step when `through` is not after it. The
 * rule `flow-draft/routing.ts` reads a span by.
 */
function spanMembers(steps: readonly AutomationStudioFlowDraftStep[], first: AutomationStudioFlowDraftStep, through: string): string[] {
  const start = steps.indexOf(first);
  const end = steps.findIndex((candidate) => automationStudioFlowDraftStepId(candidate) === through);
  if (start < 0 || end < start) return [automationStudioFlowDraftStepId(first)];
  return steps.slice(start, end + 1).filter(automationStudioFlowDraftStepIsProposed).map(automationStudioFlowDraftStepId);
}

/** The screened row labels in what the judge is shown of a list read: the first answer naming any. */
function rowLabels(observed: JsonValue | undefined): readonly string[] | undefined {
  const answers = Array.isArray(observed) ? observed : [observed];
  for (const answer of answers) {
    if (!answer || typeof answer !== "object" || Array.isArray(answer)) continue;
    const named = answer[AUTOMATION_STUDIO_BUILD_TEST_READ_ROWS_KEY];
    if (!named || typeof named !== "object" || Array.isArray(named)) continue;
    const list = named.rows;
    if (Array.isArray(list) && list.every((label) => typeof label === "string")) return list as string[];
  }
  return undefined;
}

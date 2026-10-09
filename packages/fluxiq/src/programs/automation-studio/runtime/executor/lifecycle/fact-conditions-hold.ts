// Whether a list of fact conditions all hold (state-aware recovery plan, C9).
//
// This module owns the one "all true" rule every guard uses: a handler's
// `when` and `completionCheck`, an entry's and a checkpoint's `when`, and a
// Subflow's success check.

import type { AutomationStudioFactCondition, AutomationStudioFactConditionResult, AutomationStudioFactTruth } from "./fact-condition.ts";

/**
 * Whether every condition is `true`, from the host's batched answers, which
 * are read by position: `results[i]` answers `conditions[i]`.
 *
 * - `"true"` only when every condition has an answer and every answer is `true`.
 *   An empty list holds: a guard that asks nothing is satisfied.
 * - `"false"` when any answer is `false`: no later answer can make the whole true.
 * - `"unknown"` otherwise -- an answer missing, or one the host could not settle.
 *   It never becomes `"true"`, so a guard with an unsettled part never passes.
 */
export function automationStudioFactConditionsHold(
  conditions: readonly AutomationStudioFactCondition[],
  results: readonly (AutomationStudioFactConditionResult | undefined)[]
): AutomationStudioFactTruth {
  let unsettled = false;
  for (let index = 0; index < conditions.length; index += 1) {
    const truth = results[index]?.truth;
    if (truth === "false") return "false";
    if (truth !== "true") unsettled = true;
  }
  return unsettled ? "unknown" : "true";
}

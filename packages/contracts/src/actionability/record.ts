/** A measured fact about one exact target; absence leaves its usability unknown.
 * This fact makes no claim about an action's effect, retryability or authority. */
export type AutomationStudioTargetActionabilityRecord =
  | { actionable: true }
  | { actionable: false; cause: "hidden" | "disabled" | "covered" };

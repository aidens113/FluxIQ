/** A measured fact about one exact target; absence leaves its usability unknown.
 * This fact makes no claim about an action's effect, retryability or authority. */
export type RuntimeTargetActionabilityRecord =
  | { actionable: true }
  | { actionable: false; cause: "hidden" | "disabled" | "covered" };

// Compatibility names retained for existing Automation Studio consumers.
export {
  type RuntimeTargetActionabilityRecord as AutomationStudioTargetActionabilityRecord
};

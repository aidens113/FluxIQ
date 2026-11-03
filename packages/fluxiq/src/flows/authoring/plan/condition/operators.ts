import type { AutomationConditionOperator } from "@fluxiq/contracts/state";

/**
 * The operators the router evaluates on the state it is given. The rest of
 * Core's vocabulary -- `changed`, `increased`, `decreased`, `stable_for` --
 * needs a history of transitions the router does not have, so it fails
 * closed there and is refused here rather than authored into a rule that can
 * never hold.
 */
export const AUTOMATION_STUDIO_ROUTE_CONDITION_OPERATORS = [
  "equals",
  "not_equals",
  "exists",
  "greater_than",
  "less_than",
  "contains",
  "matches",
  "similar_to",
  "became_true",
  "became_false"
] as const satisfies readonly AutomationConditionOperator[];

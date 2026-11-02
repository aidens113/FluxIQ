import type { AutomationStudioExplorationStopReason } from "./contract.ts";
import type { AutomationStudioExplorationOutcome } from "../contract.ts";

/** Each stop reason's outcome. Exhaustive, so a new reason must be classified here. */
export const AUTOMATION_STUDIO_EXPLORATION_OUTCOME_FOR_STOP_REASON: Readonly<Record<AutomationStudioExplorationStopReason, AutomationStudioExplorationOutcome>> = Object.freeze({
  wall_clock_expired: "budget_exhausted",
  recovery_deadline_expired: "budget_exhausted",
  action_limit: "budget_exhausted",
  provider_call_limit: "budget_exhausted",
  // Going in circles is its own ending, and the reason it is not
  // `budget_exhausted` is what an operator does next: a run that stopped on
  // money or on the clock is a number to raise, and a run that kept asking the
  // same question is not. Both repeat guards say so -- the action-level window
  // and the streak guard that watches whether anything is still being learned.
  repeat_window: "no_progress",
  no_progress: "no_progress",
  destructive_action_refused: "unsafe_action_blocked",
  out_of_scope_refused: "unsafe_action_blocked",
  refusal_limit: "unsafe_action_blocked",
  operator_approval_required: "user_intervention_required"
});

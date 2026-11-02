/**
 * Why the budget closed an exploration, in Core's own words.
 *
 * A stop reason is finer than an outcome on purpose. Both `wall_clock_expired`
 * and `recovery_deadline_expired` are `budget_exhausted`, but only one of them
 * means the whole recovery ran out of time rather than this one exploration,
 * and a report that could not say which would send somebody to raise the wrong
 * limit.
 */
export const AUTOMATION_STUDIO_EXPLORATION_STOP_REASONS = Object.freeze([
  "wall_clock_expired",
  "recovery_deadline_expired",
  "action_limit",
  "provider_call_limit",
  "repeat_window",
  "no_progress",
  "destructive_action_refused",
  "out_of_scope_refused",
  "refusal_limit",
  "operator_approval_required"
] as const);

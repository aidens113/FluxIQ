// Why a handler came to `unhandled` (state-aware recovery plan, C5, C11), as
// closed codes a trace keeps beside the disposition.
//
// The decision's `reason` is a sentence for a person; these are what a reader
// that counts or routes on the reason reads, so the stored record never has
// to be parsed to tell a completion check that did not hold from a route a
// guard refused (t404 row 10: the record said only `unhandled`).

/**
 * Where an `unhandled` came from:
 *
 * - `written_unhandled`: the handler's body ended `unhandled` itself.
 * - `body_failed`: the body did not finish, or never reached its Handler End.
 * - `completion_check_not_true`: the completion check answered `false` or `unknown`.
 * - `disposition_not_allowed`: the written disposition is one this event refuses (C5's table).
 * - `resolve_missing_outputs`: a `resolve` left out an output the contract requires.
 * - `route_refused`: a guard refused the route; `guard` says which.
 * - `budget_spent`: the run's recovery budget had no handler run or route left.
 * - `already_tried`: the handler already ran for this incident.
 * - `no_body`: the handler has no body to run.
 * - `core_stop`: a Core stop stood (a cancel, a permission, an uncertain act); the trace reads it as `unhandled`.
 */
export const AUTOMATION_STUDIO_UNHANDLED_REASONS = Object.freeze([
  "written_unhandled",
  "body_failed",
  "completion_check_not_true",
  "disposition_not_allowed",
  "resolve_missing_outputs",
  "route_refused",
  "budget_spent",
  "already_tried",
  "no_body",
  "core_stop"
] as const);

export type AutomationStudioUnhandledReason = (typeof AUTOMATION_STUDIO_UNHANDLED_REASONS)[number];

/**
 * Which guard refused a route:
 *
 * - `checkpoint_not_found`: no such checkpoint in this frame or one that called it.
 * - `checkpoint_not_holding`: the checkpoint's `when` did not answer `true`.
 * - `requires_unbound`: a value the checkpoint `requires` is not bound.
 * - `passes_uncertain_act`: the route would move past an act whose outcome is uncertain.
 * - `unreachable`: the step loop cannot move to the checkpoint's node (not in the graph as it runs, or a frame not executing).
 * - `unguarded`: the run had no way to judge what the route would pass, so it is never taken.
 * - `repeats_unrecorded_act`: the route goes back past an act that completed
 *   in this run but is not in its completed-act ledger -- a run resumed from a
 *   saved trace starts with an empty one -- so nothing would skip it.
 */
export const AUTOMATION_STUDIO_ROUTE_REFUSAL_GUARDS = Object.freeze([
  "checkpoint_not_found",
  "checkpoint_not_holding",
  "requires_unbound",
  "passes_uncertain_act",
  "unreachable",
  "unguarded",
  "repeats_unrecorded_act"
] as const);

export type AutomationStudioRouteRefusalGuard = (typeof AUTOMATION_STUDIO_ROUTE_REFUSAL_GUARDS)[number];

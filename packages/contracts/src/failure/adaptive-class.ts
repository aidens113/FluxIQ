/**
 * FluxIQ's one failure-category list. Core names every member and classifies
 * failed attempts into them; a domain decides which member applies and reports
 * it in an `AutomationStudioFailureRecord`. No second list exists in Core or in
 * an importing domain.
 *
 * Adding a member breaks exhaustive consumers, so before 1.0 it is a minor
 * version bump with a migration note.
 */
export const AUTOMATION_STUDIO_ADAPTIVE_FAILURE_CLASSES = Object.freeze([
  /** The action ran and failed for a reason no other member names. */
  "action_failed",
  /** Expected transition evidence (outputs, effects, or state) was not confirmed. */
  "expected_state_missing",
  /** The run reached a route, status, or state other than the expected one. */
  "unexpected_state",
  /** The action, or the wait for its result, exceeded its time limit. */
  "timeout",
  /** A capability, policy, or authorization gate refused the action, including a client rejecting it as unsupported. */
  "blocked_by_capability_or_policy",
  /** A router rule or Subflow the run needed does not exist. */
  "missing_router_or_subflow_target",
  /** The Flow is structurally invalid or names a node with no implementation. */
  "graph_validation_or_unknown_node",
  /** An external side effect was required but not permitted. */
  "external_side_effect_denied",
  /** The producer could not determine a cause. */
  "ambiguous_or_unknown",
  /** No candidate for the action's target matched with enough confidence. */
  "target_not_found",
  /** Several candidates matched the action's target and none could be preferred. */
  "target_ambiguous",
  /** The host moved somewhere the action did not ask for, or never reached where it asked to go. */
  "navigation_unexpected",
  /** The action reported success but its intended effect was never observed. */
  "output_not_observed",
  /** The surface the action targeted was replaced between resolving the target and executing the action. */
  "page_changed",
  /** The host requires authentication before the action can continue. */
  "auth_required",
  /** A person must act before the run can continue. */
  "user_intervention_required"
] as const);

export type AutomationStudioAdaptiveFailureClass = (typeof AUTOMATION_STUDIO_ADAPTIVE_FAILURE_CLASSES)[number];

const FAILURE_CLASSES: ReadonlySet<string> = new Set(AUTOMATION_STUDIO_ADAPTIVE_FAILURE_CLASSES);

export function isAutomationStudioAdaptiveFailureClass(value: unknown): value is AutomationStudioAdaptiveFailureClass {
  return typeof value === "string" && FAILURE_CLASSES.has(value);
}

/** Core's plain sentence for each failure category (`@fluxiq/contracts` `AUTOMATION_STUDIO_ADAPTIVE_FAILURE_CLASSES`). */
const HAPPENED: Readonly<Record<string, string>> = Object.freeze({
  action_failed: "The step ran and did not work.",
  expected_state_missing: "The step ran, but what it should have changed was not seen.",
  unexpected_state: "The step ended somewhere other than expected.",
  timeout: "The step, or the wait for its result, ran out of time.",
  blocked_by_capability_or_policy: "A permission or policy refused the step.",
  missing_router_or_subflow_target: "The step named a route or Subflow that does not exist.",
  graph_validation_or_unknown_node: "The step names a node that cannot run.",
  external_side_effect_denied: "The step needed a lasting act it is not permitted to do.",
  ambiguous_or_unknown: "The step failed for a reason the page did not make clear.",
  target_not_found: "The step's control was not found on the page.",
  target_ambiguous: "More than one control matched the step's control, and none could be chosen.",
  navigation_unexpected: "The page went somewhere the step did not ask for, or did not reach where it asked to go.",
  output_not_observed: "The step reported success, but its effect was never seen.",
  page_changed: "The page changed under the step before it could act.",
  auth_required: "The site asked to sign in before the step could go on.",
  user_intervention_required: "The page needs a person before the step can go on."
});

/** What happened to a step that failed, in Core's words for the failure's category; an unknown category reads as a step that did not work. */
export function automationStudioTrialFailureHappened(category: string): string {
  return HAPPENED[category] ?? HAPPENED.action_failed!;
}

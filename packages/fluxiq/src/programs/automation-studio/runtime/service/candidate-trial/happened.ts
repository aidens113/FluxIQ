// Core's plain sentence for what happened to a step that failed.
//
// **A refused step is said as refused (t489, F3).** Lane D round 13
// (`run-mv66sc3c-c47e74b8`, trials 2 to 4) was told "The step names a node that
// cannot run" for a read whose record output its node refused as written. The
// node was registered and ran; only its parameters were wrong. The category
// `graph_validation_or_unknown_node` covers both, so its sentence now speaks of
// a refused step, and only a code that does say the node itself cannot run
// (`executor.node.*`) keeps the node sentence. A record output refusal
// (`record_output.*`) names `recordOutput`, and both point at the step's
// `issues`, which list what its node refused (`./step-issues.ts`).

/** Core's plain sentence for each failure category (`@fluxiq/contracts` `AUTOMATION_STUDIO_ADAPTIVE_FAILURE_CLASSES`). */
const HAPPENED: Readonly<Record<string, string>> = Object.freeze({
  action_failed: "The step ran and did not work.",
  expected_state_missing: "The step ran, but what it should have changed was not seen.",
  unexpected_state: "The step ended somewhere other than expected.",
  timeout: "The step, or the wait for its result, ran out of time.",
  blocked_by_capability_or_policy: "A permission or policy refused the step.",
  missing_router_or_subflow_target: "The step named a route or Subflow that does not exist.",
  graph_validation_or_unknown_node: "The step's node refused the step as written, so it did nothing; failureCode, and issues where listed, say what to change in the step.",
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

/** A node the run could not execute at all (`executor.node.not_executable`, `executor.node.definition_version_unavailable`). */
const NODE_UNAVAILABLE = /^executor\.node\./u;
const NODE_UNAVAILABLE_SAID = "The step names a node that cannot run.";
/** A record output its node or the run refused (`record_output.invalid`, `record_output.encrypt_unavailable`, ...). */
const RECORD_OUTPUT = /^record_output\./u;
const RECORD_OUTPUT_SAID = "The step's recordOutput was refused as written, so no rows were saved; issues lists each part refused, with the field it names and the names it can use where known. Change the step's recordOutput or its read to match.";

/**
 * What happened to a step that failed, in Core's words for the failure's
 * category, or for its code where the category alone would say something
 * untrue (header); an unknown category reads as a step that did not work.
 */
export function automationStudioTrialFailureHappened(category: string, code?: string): string {
  if (category === "graph_validation_or_unknown_node" && code !== undefined) {
    if (NODE_UNAVAILABLE.test(code)) return NODE_UNAVAILABLE_SAID;
    if (RECORD_OUTPUT.test(code)) return RECORD_OUTPUT_SAID;
  }
  return HAPPENED[category] ?? HAPPENED.action_failed!;
}

// The step a failed run failed at, and whether it failed the way a re-author
// answers: its target not found on the page, or not told apart from others.
//
// Read in two places, and one rule so the two cannot drift:
//
// - the decision (`step-failure-decision.ts`), over the run record the ladder
//   wrote;
// - the verification (`result-verification/run-outcome.ts`), over the run's own
//   trace, *before* it reads that record from the project's store. Every run
//   that fails is handed to the verification, and almost none fail at a target
//   (t207). A run whose trace already says the route will not take it is handed
//   back without the read: it is how a failed run ended before t193, and a store
//   that is closing or cannot be opened -- which may be the very thing the run
//   failed at -- is then not asked again, and cannot turn a failed run into a
//   thrown error.
//
// The trace and the record agree on this: the record's action attempts are the
// trace's attempts, their failures parsed by the same contract
// (`service/summaries/conversions.ts`).

import { parseAutomationStudioFailureRecord, type AutomationStudioAdaptiveFailureClass, type AutomationStudioFailureRecord } from "@fluxiq/contracts/automation-studio";

/**
 * The failure categories a re-author answers: the two Core's taxonomy decides
 * while resolving the action's target (`@fluxiq/contracts` refuses either at
 * any other stage). Each says the control the step addresses is not on the
 * surface as it was recorded -- gone, renamed, moved, or no longer told apart
 * from its neighbours -- which is what a site that changed since the build
 * looks like, and what re-finding the step answers.
 *
 * Not included, each for its reason:
 * - `page_changed`: the surface was replaced between resolving and acting, a
 *   race the ladder retries deterministically, not a redesign.
 * - `auth_required`, `user_intervention_required`,
 *   `external_side_effect_denied`, `blocked_by_capability_or_policy`: a person
 *   or a policy must act, and a rebuilt Flow would meet the same gate.
 * - `timeout`, `navigation_unexpected`, `output_not_observed`,
 *   `expected_state_missing`, `unexpected_state`, `action_failed`,
 *   `ambiguous_or_unknown`: the step's control was found, so re-finding it
 *   answers nothing the failure asked.
 * - `missing_router_or_subflow_target`, `graph_validation_or_unknown_node`:
 *   the Flow is structurally broken, which is the build's own validation's
 *   business, not a site change.
 */
const TARGET_LEVEL_FAILURE_CATEGORIES: ReadonlySet<AutomationStudioAdaptiveFailureClass> = new Set<AutomationStudioAdaptiveFailureClass>([
  "target_not_found",
  "target_ambiguous"
]);

/**
 * The last attempt that failed (or ended unknown), its failure as parsed, and
 * whether that failure is target-level. Nothing when no attempt failed, or the
 * last one's failure record does not parse. Only the root frame's attempts are
 * read: a called part's (`parentAttemptId`) is a node of the part, not the Flow.
 */
export function automationStudioStepFailureTarget<T extends { status: string; failure?: unknown; parentAttemptId?: string | undefined }>(
  attempts: readonly T[] | undefined
): { attempt: T; failure: AutomationStudioFailureRecord; targetLevel: boolean } | undefined {
  const attempt = [...(attempts ?? [])].reverse().find((candidate) => candidate.parentAttemptId === undefined && (candidate.status === "failed" || candidate.status === "unknown"));
  const failure = attempt ? parseAutomationStudioFailureRecord(attempt.failure) : null;
  if (!attempt || !failure) return undefined;
  return { attempt, failure, targetLevel: TARGET_LEVEL_FAILURE_CATEGORIES.has(failure.category) };
}

import type { AutomationStudioLlmTaskResult } from "../llm/index.ts";

/**
 * Which rung of the recovery loop declined, when one did.
 *
 * A code says *why* nothing was repaired; this says *who* decided it, in the
 * loop's own four-stage vocabulary (`stages.ts`). The two together are what a
 * run needs to say instead of falling silent: `plan` + `goal_unachievable`
 * reads as "the plan stopped, because the diagnosis said the step's result can
 * no longer be reached", which is a different thing to answer than `resolution`
 * + `permission_required`.
 */
export type AutomationStudioRuntimeRecoveryRung = "diagnosis" | "plan" | "exploration" | "resolution";

/**
 * Core's reasons for not asking for a runtime patch, one code each.
 *
 * Every one of these used to reach a run as the single code
 * `llm.runtime_patch_not_requested`, so "the model said the goal is gone",
 * "the diagnosis call returned something else" and "the policy permits no
 * patch kind here" were one word on the record. Live run
 * `run-muesyox4-930bef98` (2026-09-23) is the case that made it matter: a
 * `target_not_found` whose diagnosis validated, and whose refusal could not be
 * attributed to any of the five clauses from the run's artifacts.
 *
 * The shape is fixed by more than taste. The Lab's run-detail parser accepts a
 * skip code only when it matches `llm.runtime_patch_[a-z_]+`, and drops
 * anything else *silently*, so a code outside this shape would restore the
 * silence it is here to end.
 */
export const AUTOMATION_STUDIO_RUNTIME_PATCH_SKIP_CODES = Object.freeze({
  /** No diagnosis call was made, so there is no answer to continue from. */
  no_diagnosis_requested: "llm.runtime_patch_no_diagnosis_requested",
  /** The diagnosis call itself failed: provider, budget, transport or output validation. */
  diagnosis_call_failed: "llm.runtime_patch_diagnosis_call_failed",
  /** The call succeeded and answered with something other than a diagnosis. */
  diagnosis_not_returned: "llm.runtime_patch_diagnosis_not_returned",
  /** Stage A resolved the failure without the model, so the plan has nothing to ask for. */
  resolved_without_model: "llm.runtime_patch_resolved_without_model",
  /** The diagnosis says the step's intended result can no longer be reached. */
  goal_unachievable: "llm.runtime_patch_goal_unachievable",
  /** The diagnosis asked for neither a patch nor exploration. */
  diagnosis_asked_for_none: "llm.runtime_patch_diagnosis_asked_for_none",
  /** The adaptation policy permits no patch kind that could serve this failure. */
  policy_allows_no_kind: "llm.runtime_patch_policy_allows_no_kind"
} as const);

export type AutomationStudioRuntimePatchSkipCode =
  (typeof AUTOMATION_STUDIO_RUNTIME_PATCH_SKIP_CODES)[keyof typeof AUTOMATION_STUDIO_RUNTIME_PATCH_SKIP_CODES];

/**
 * Whether the second, billed `runtime_patch` call should happen, and -- when it
 * should not -- which rung said so and under which code.
 */
export type AutomationStudioRuntimePatchRequestDecision = {
  request: boolean;
  reason: string;
  /** Core's code for this refusal. Absent exactly when `request` is true. */
  code?: AutomationStudioRuntimePatchSkipCode;
  /** The rung that refused. Absent exactly when `request` is true. */
  rung?: AutomationStudioRuntimeRecoveryRung;
};

/**
 * Whether the second, billed `runtime_patch` call should happen.
 *
 * Diagnosis and patch used to be two independent calls: the patch ran whenever
 * a provider existed, so a failed or malformed diagnosis still billed a second
 * call. The patch is a continuation of the diagnosis, so it runs only when the
 * diagnosis succeeded and actually returned a diagnosis.
 *
 * Each refusal here belongs to the `diagnosis` rung: it is about the answer the
 * diagnosis call gave, not about what the plan would do with one.
 */
export function decideAutomationStudioRuntimePatchRequest(diagnosis: AutomationStudioLlmTaskResult | undefined): AutomationStudioRuntimePatchRequestDecision {
  if (!diagnosis) return { request: false, reason: "No diagnosis was requested.", code: AUTOMATION_STUDIO_RUNTIME_PATCH_SKIP_CODES.no_diagnosis_requested, rung: "diagnosis" };
  if (!diagnosis.ok) return { request: false, reason: "The diagnosis call failed, so there is nothing to patch from.", code: AUTOMATION_STUDIO_RUNTIME_PATCH_SKIP_CODES.diagnosis_call_failed, rung: "diagnosis" };
  if (diagnosis.response?.kind !== "diagnosis") {
    return { request: false, reason: `The diagnosis returned ${diagnosis.response?.kind ?? "no structured response"}, so no patch was requested.`, code: AUTOMATION_STUDIO_RUNTIME_PATCH_SKIP_CODES.diagnosis_not_returned, rung: "diagnosis" };
  }
  return { request: true, reason: "The diagnosis succeeded and calls for a runtime patch." };
}

/**
 * The refusals a look at the page could overturn.
 *
 * One, and it is the one that matters. `goal_unachievable` is the model's claim
 * *about the page* -- that the step's result can no longer be reached -- given
 * before it had seen one. Live run `run-muesyox4-930bef98` (2026-09-23) is the
 * case: the model was shown an 819-byte packet with no same-family control and
 * no fingerprint candidate on it, said the goal was gone, and the loop cancelled
 * the exploration on the strength of that answer, so the single claim a page
 * could have settled was the single claim nothing checked. `plan.ts` has always
 * said a refusal must stay checkable; the gate in `annotate.ts` did not, and
 * this set is what reconciles them.
 *
 * The other six are out, each for its own reason. A diagnosis that was never
 * requested, that failed, or that answered with something else leaves no claim
 * to check and nothing to re-plan from. A failure Stage A resolved without the
 * model was decided by Core's classifier rather than by a reading of the page. A
 * policy that permits no patch kind is a person's setting, which a page cannot
 * speak to, so looking would spend a run's calls on an answer that could not
 * change. And `diagnosis_asked_for_none` cannot reach here at all: it is decided
 * by `!patchNeeded && !explorationNeeded`, and `explorationNeeded` false is
 * exactly what stops an exploration running, so there is never a look to
 * re-plan from. It is left out rather than included harmlessly, because a set
 * that lists an unreachable member reads as a rule nobody has checked.
 */
export const AUTOMATION_STUDIO_RUNTIME_PATCH_SKIP_CODES_CHECKABLE_BY_EXPLORATION: ReadonlySet<AutomationStudioRuntimePatchSkipCode> = Object.freeze(new Set<AutomationStudioRuntimePatchSkipCode>([
  AUTOMATION_STUDIO_RUNTIME_PATCH_SKIP_CODES.goal_unachievable
]));

/**
 * Whether this refusal is worth exploring and re-planning, rather than final.
 *
 * A decision that asked for a patch is not a refusal and answers `false`: the
 * exploration it gets is the patch's errand, which the caller already runs.
 */
export function automationStudioRuntimePatchRefusalIsCheckableByExploration(decision: AutomationStudioRuntimePatchRequestDecision): boolean {
  return !decision.request && decision.code !== undefined && AUTOMATION_STUDIO_RUNTIME_PATCH_SKIP_CODES_CHECKABLE_BY_EXPLORATION.has(decision.code);
}

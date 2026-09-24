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

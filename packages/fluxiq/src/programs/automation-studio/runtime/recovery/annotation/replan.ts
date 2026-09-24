// Planning again, after looking at the page.
//
// The loop's plan stage is deterministic and costs no provider call, and that
// is right for a plan built from what is already known. It is wrong for one
// built from a claim nobody checked. A diagnosis that answers
// `stillAchievable: "no"` is saying something about a page -- the record is
// gone, the control is locked, the destination is guarded -- and until the run
// has looked at that page, "the model declined" and "the model declined after
// looking" are the same sentence on the record.
//
// Live run `run-muesyox4-930bef98` (2026-09-23) is why this exists. Its
// diagnosis was shown an 819-byte failure packet carrying no same-family
// control and no fingerprint candidate, concluded the goal was gone, and the
// exploration gate in `annotate.ts` read the resulting "no patch" and cancelled
// the look as well. The run produced no patch, no adaptation and, until t113, no
// code saying why. t113 made it say why. This makes the answer worth something:
// the loop explores anyway, puts the packets it gathered and the model's own
// earlier answer in front of a second call, and rebuilds the plan from what
// comes back.
//
// Three properties are deliberate.
//
// **It is one call, and only on a refusal a page could overturn.** The set is
// `diagnosis-chain.ts`'s, and a plan that already asked for a patch never
// re-plans: its exploration is the patch's errand and the patch call is the one
// that follows.
//
// **A failed re-plan leaves the original refusal standing.** If the second call
// does not come back with a diagnosis there is nothing to re-plan from, and
// inventing a patch request out of a failed call would be worse than the
// refusal it replaced. The run then records a refusal that was *not* checked,
// which is the truth about it.
//
// **A refusal that survives the look changes rung, not code.** The reason is the
// same reason -- the goal is gone -- so the code stays `goal_unachievable`. What
// changed is who decided it: `plan` means the model said so before it saw the
// page, `exploration` means it said so after. That pair is the whole difference
// this module exists to create, and it is said in the vocabulary
// `diagnosis-chain.ts` already had rather than in a new code.

import type { AutomationStudioAdaptationPolicy, AutomationStudioFlowRunDetail } from "../../../model/index.ts";
import {
  runAutomationStudioLlmHarness,
  type AutomationStudioLlmProvider,
  type AutomationStudioLlmTaskResult
} from "../../llm/index.ts";
import type { AutomationStudioRuntimeDeterministicDiagnosis } from "../deterministic-diagnosis.ts";
import type { AutomationStudioRuntimeRecoveryContext } from "../context.ts";
import { planAutomationStudioRuntimeRecovery, type AutomationStudioRuntimeRecoveryPlan } from "../plan.ts";

/** What re-planning after a look produced, and whether the look changed anything. */
export type AutomationStudioRecoveryReplan = {
  /**
   * The plan the rest of the recovery works to: the rebuilt one, or the plan it
   * started from when the second call returned no diagnosis to rebuild from.
   */
  plan: AutomationStudioRuntimeRecoveryPlan;
  /** The second call's own result, for the run's interventions, diagnostics and totals. */
  result: AutomationStudioLlmTaskResult;
  /** Whether the call came back with a diagnosis the plan could be rebuilt from. */
  ok: boolean;
  /** Whether the rebuilt decision differs from the one made before the look. */
  changed: boolean;
};

export type AutomationStudioRecoveryReplanInput = {
  /** The plan whose refusal is under review. Its `patchRequest` is what `changed` is measured against. */
  plan: AutomationStudioRuntimeRecoveryPlan;
  /** Stage A's classification. The rebuilt plan is built from this and the new answer. */
  deterministic?: AutomationStudioRuntimeDeterministicDiagnosis | undefined;
  policy: AutomationStudioAdaptationPolicy;
  /**
   * The packets the exploration returned and the room they may take. Required:
   * a re-plan shown none of them is the first diagnosis asked again, at the same
   * price, for the same answer.
   */
  explorationEvidence: NonNullable<Parameters<typeof runAutomationStudioLlmHarness>[0]["explorationEvidence"]>;
  /**
   * Everything the second call carries that the first one did, passed through
   * unread -- including the provider, which the caller has already resolved and
   * which this never reaches for on its own.
   */
  request: Omit<
    Parameters<typeof runAutomationStudioLlmHarness>[0],
    "taskKind" | "stage" | "previousStage" | "expectedOutput" | "explorationEvidence" | "metadata"
  > & { provider: AutomationStudioLlmProvider; runDetail: AutomationStudioFlowRunDetail; recoveryContext: AutomationStudioRuntimeRecoveryContext };
  /** Merged into the call's metadata, beside this module's own source and expectation. */
  metadata?: Record<string, string> | undefined;
};

/**
 * One second diagnosis, made at the `plan` stage with the page in hand, and the
 * plan rebuilt from what it says.
 *
 * The stage is not decoration. `gather` then `plan` is a legal one-step advance
 * through Core's fixed order, the `plan` stage instruction is already the right
 * instruction for this call -- state what you intend to change and why, and
 * where the evidence supports no step at all say that plainly instead of
 * proposing one -- and the patch that may follow has always declared
 * `previousStage: "plan"` for a plan stage no call had ever occupied. This is
 * the call that occupies it.
 */
export async function replanAutomationStudioRecoveryAfterExploration(
  input: AutomationStudioRecoveryReplanInput
): Promise<AutomationStudioRecoveryReplan> {
  const result = await runAutomationStudioLlmHarness({
    ...input.request,
    taskKind: "runtime_diagnosis",
    stage: "plan",
    previousStage: "gather",
    expectedOutput: "diagnosis",
    explorationEvidence: input.explorationEvidence,
    // This module's own keys go last, so a caller's metadata can add to the
    // record and never rename the call.
    metadata: { ...(input.metadata ?? {}), source: "runRuntimeSession", expectedOutput: "diagnosis", replan: "after_exploration" }
  });
  // No diagnosis, nothing to re-plan from. The plan it started from stands, and
  // the run records a refusal the look did not get to check rather than one the
  // look confirmed.
  if (!result.ok || result.response?.kind !== "diagnosis") {
    return { plan: input.plan, result, ok: false, changed: false };
  }
  const rebuilt = planAutomationStudioRuntimeRecovery({
    ...(input.deterministic ? { deterministic: input.deterministic } : {}),
    result,
    policy: input.policy
  });
  const plan = rebuilt.patchRequest.request
    ? rebuilt
    : { ...rebuilt, patchRequest: { ...rebuilt.patchRequest, rung: "exploration" as const } };
  return {
    plan,
    result,
    ok: true,
    changed: plan.patchRequest.request !== input.plan.patchRequest.request || plan.patchRequest.code !== input.plan.patchRequest.code
  };
}

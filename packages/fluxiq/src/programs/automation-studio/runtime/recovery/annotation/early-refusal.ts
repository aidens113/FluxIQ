// The recoveries that end before any of the four stages runs, each with a
// gate code and a trace that says so in the same vocabulary as every other
// outcome (`./annotate.ts`): nothing happened is always a stage saying so.
//
// - An incident the run already asked about while held at its failing step
//   (C6 step 8) is never asked about again: one model consultation per
//   incident. Its record from the run is already on the detail
//   (`../../service/runtime-adaptation/context.ts`) and stands as the run's;
//   a fault that stopped that recovery is thrown again instead.
// - A run that ended at an authored stop -- an End whose result is `failed` --
//   ended where its author wrote that it should, with its own reason, and a
//   deliberate stop is never a model call (C6, "What counts as a true failure").
// - Training mode or settings that do not allow a model, or a training budget
//   that is spent for a run nobody asked the model into.
// - A recovery that is one part of a repair whose purse is spent.
//
// A refuted result is a question about the answer, not about a failed step,
// and is held to neither of the first two.

import type { JsonObject } from "../../../../../core/index.ts";
import type { AutomationStudioFlowRunDetail } from "../../../model/index.ts";
import type { AutomationStudioLlmRunBudgetDiagnostic } from "../../llm/index.ts";
import type { AutomationStudioRuntimeAdaptationContext } from "../../service.ts";
import { automationStudioRuntimeRecoveryRefusedTrace } from "../stages.ts";
import { automationStudioUnresolvedFailedAttempt } from "../unresolved-failed-attempt.ts";

/** The detail with the refusal recorded, or undefined when the recovery goes on to its stages. */
export function automationStudioRecoveryEarlyRefusal(input: {
  detail: AutomationStudioFlowRunDetail;
  context: AutomationStudioRuntimeAdaptationContext;
  /** The run is held at its failing step and asking now. */
  inRun: boolean;
  /** The recovery was entered from a refuted result. */
  refutedResult: boolean;
  failedTraceAttempt?: { nodeId: string; definitionId?: string; status: string; repair?: unknown; framePath?: readonly string[] | undefined } | undefined;
  /** A person asked the model into this run, so it is held to its own budget rather than the training settings'. */
  explicitRunBudget: boolean;
  costLeftUsd?: number | undefined;
}): AutomationStudioFlowRunDetail | undefined {
  const { detail, context } = input;
  const attempt = input.failedTraceAttempt;
  if (!input.inRun && !input.refutedResult && attempt && (attempt.repair || context.inRunRepairs?.attempted(attempt))) {
    // A recovery the run could not finish ends the run session here, as it
    // would have had it run after the run: a fault it deliberately does not
    // catch is not a refusal.
    const fault = context.inRunRepairs?.fault();
    if (fault !== undefined) throw fault;
    if (detail.metadata?.llmGate) return detail;
    return refused(detail, { code: "llm.gate.repaired_in_run" }, "The run already asked for a fix to this failure at the failing step, so no model was asked again.");
  }
  if (!input.inRun && !input.refutedResult && isDeliberateStop(attempt ?? automationStudioUnresolvedFailedAttempt(detail.actionAttempts ?? []))) {
    return refused(detail, { code: "llm.gate.deliberate_stop" }, "The Flow stopped where it was written to stop, with its own reason, so no model was asked.");
  }
  if (!context.behavior.invokeLlm) {
    return refused(detail, { code: "llm.gate.training_mode" }, "Current training mode or settings do not allow LLM intervention.");
  }
  if (!input.explicitRunBudget && !context.budgetDecision.ok) {
    return refused(detail, { code: "llm.gate.training_budget_exhausted" }, `Training budget exhausted: ${context.budgetDecision.exhausted.join(", ")}.`);
  }
  // Handed on, a total of zero would be ignored as no limit at all and the
  // recovery would take the whole ceiling, so it stops here and says why.
  if (input.costLeftUsd !== undefined && !(input.costLeftUsd > 0)) {
    return refused(detail, { code: RECOVERY_COST_BOUND_CODE, bound: "cost" }, "The repair's cost ceiling is spent, so no model was asked.");
  }
  return undefined;
}

function refused(detail: AutomationStudioFlowRunDetail, gate: JsonObject, reason: string): AutomationStudioFlowRunDetail {
  return {
    ...detail,
    metadata: {
      ...(detail.metadata ?? {}),
      llmGate: { invoked: false, ...gate, reason },
      recoveryTrace: automationStudioRuntimeRecoveryRefusedTrace(reason) as unknown as JsonObject
    }
  };
}

/** An End's attempt fails only for `resultStatus: failed`: an authored stop. */
function isDeliberateStop(attempt: { definitionId?: string; status: string } | undefined): boolean {
  return attempt?.definitionId === "builtin.control.end" && attempt.status === "failed";
}

/** Why a recovery with nothing left of its repair's purse asked no model: the run ledger's own code for a total that cannot take another call. */
const RECOVERY_COST_BOUND_CODE: Extract<AutomationStudioLlmRunBudgetDiagnostic["code"], "llm_budget.run_cost_limit"> = "llm_budget.run_cost_limit";

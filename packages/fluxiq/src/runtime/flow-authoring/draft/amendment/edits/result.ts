import { automationStudioFlowDraftStepIsProposable, type AutomationStudioFlowDraftStep } from "../../step.ts";

/**
 * The `result` edit on one step: this read holds the answer. A read is a step that observes and
 * is of the kind a Flow is made of. The step is put in the Flow and carries `result: true`
 * (`../../step.ts`); the framework's own choice of result gives way to it. Says why nothing was
 * done: not a read, or already the result and in the Flow.
 */
export function automationStudioFlowDraftEditResult(step: AutomationStudioFlowDraftStep): { ok: true } | { ok: false; reason: "not_a_read" | "already_so" } {
  if (step.effect !== "observe" || !automationStudioFlowDraftStepIsProposable(step)) return { ok: false, reason: "not_a_read" };
  if (step.result === true && step.disposition === "kept") return { ok: false, reason: "already_so" };
  step.result = true;
  step.disposition = "kept";
  delete step.drafted;
  return { ok: true };
}

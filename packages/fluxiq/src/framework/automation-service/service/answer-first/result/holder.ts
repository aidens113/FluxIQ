// Finding the ledger step that holds a draft step's pages, and putting a changed one back. A draft step folded into
// another (D2) is held by that other step, so every operation finds a step through here.
import type { AutomationStudioAnswerFirstResultLedger, AutomationStudioAnswerFirstResultStep } from "./types.ts";

/** The ledger step holding draft step `stepId`'s pages: its own, or the one it was folded into. */
export function automationStudioAnswerFirstResultStepHolder(ledger: AutomationStudioAnswerFirstResultLedger, stepId: string): AutomationStudioAnswerFirstResultStep | undefined {
  return ledger.steps.find((step) => step.id === stepId || step.folded.some((folded) => folded.id === stepId));
}

/** The ledger with the step of `step.id` replaced by `step`, in its place. */
export function automationStudioAnswerFirstResultWithStep(ledger: AutomationStudioAnswerFirstResultLedger, step: AutomationStudioAnswerFirstResultStep): AutomationStudioAnswerFirstResultLedger {
  return { ...ledger, steps: ledger.steps.map((each) => (each.id === step.id ? step : each)) };
}

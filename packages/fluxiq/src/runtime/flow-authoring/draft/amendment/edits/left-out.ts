import type { AutomationStudioFlowDraftStep } from "../../step.ts";

/** Whether the framework left this step out of the Flow it drafted, and no ruling of the model has since decided it (`../../step.ts`, `drafted`). */
export function automationStudioFlowDraftStepLeftOut(step: AutomationStudioFlowDraftStep): boolean {
  return step.drafted !== undefined && step.drafted !== "in" && step.disposition === "taken";
}

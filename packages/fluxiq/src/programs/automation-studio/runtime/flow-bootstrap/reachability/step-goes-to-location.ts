// One arrival classification shared by restoration and instructed-act evidence.
// The host declares opaque action identity and its location parameter; unrelated
// retained arguments on another action cannot prove arrival.
import type { AutomationStudioFlowDraftStep } from "../../flow-draft/index.ts";
import type { AutomationStudioLlmEvidenceRuntimeBinding } from "../../llm/harness-options/index.ts";
import { automationStudioFlowBootstrapValuesCarryLocation } from "./location-agreement.ts";

/** Read only the host-declared arrival argument, preferring what actually ran. */
export function automationStudioFlowBootstrapDraftStepGoesToLocation(
  step: AutomationStudioFlowDraftStep,
  startLocation: string,
  arrival?: NonNullable<AutomationStudioLlmEvidenceRuntimeBinding["runsNodes"]>["arrival"]
): boolean {
  if (!arrival || step.actionId !== arrival.node) return false;
  const parameters = (step.ranWith ?? step.input).parameters;
  if (typeof parameters !== "object" || parameters === null || Array.isArray(parameters)) return false;
  const location = parameters[arrival.parameter];
  return typeof location === "string" && automationStudioFlowBootstrapValuesCarryLocation({ location }, startLocation);
}

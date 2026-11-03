import type { AutomationStudioFlowNode } from "../../../../flows/executable/graph/index.ts";
import { automationStudioInstructedActWordsNameLastingAct } from "../../../../runtime/flow-authoring/bootstrap/instructed-acts/index.ts";
import { automationStudioModelFacingControlWords, automationStudioModelFacingControlWordsReadable } from "../../../../runtime/llm/model-facing/index.ts";

/** Compatibility interpretation for pre-contract Studio documents. */
export function automationStudioClassifyLegacyStepAct(node: Pick<AutomationStudioFlowNode, "label" | "parameterValues" | "metadata">): boolean {
  const words = automationStudioModelFacingControlWords(node.parameterValues) ?? node.label?.trim();
  if (words && automationStudioInstructedActWordsNameLastingAct(words)) return true;
  // With no domain's reading the control's words are unknown, so a step that carries a structured parameter may name a lasting act: read it as one rather than risk repeating it.
  return !automationStudioModelFacingControlWordsReadable() && Object.values(node.parameterValues ?? {}).some((value) => typeof value === "object" && value !== null);
}

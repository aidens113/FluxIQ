import type { AutomationStudioFlowNode } from "../../../../../flows/executable/graph/index.ts";
import { automationStudioInstructedActWordsNameLastingAct } from "../../flow-bootstrap/instructed-acts/index.ts";
import { automationStudioModelFacingControlWords } from "../../llm/model-facing/index.ts";

/** Compatibility interpretation for pre-contract Studio documents. */
export function automationStudioClassifyLegacyStepAct(node: Pick<AutomationStudioFlowNode, "label" | "parameterValues" | "metadata">): boolean {
  const words = automationStudioModelFacingControlWords(node.parameterValues) ?? node.label?.trim();
  return Boolean(words && automationStudioInstructedActWordsNameLastingAct(words));
}

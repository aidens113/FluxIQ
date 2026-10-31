import type { AutomationStudioFlowNode } from "../../../model/index.ts";
import { AUTOMATION_STUDIO_DECLARED_CONSEQUENCES_METADATA_KEY } from "./contracts.ts";

/** Explicit authored risk may raise a trusted state/read floor, never lower one. */
export function automationStudioNodeExplicitLastingRisk(node: Pick<AutomationStudioFlowNode, "metadata" | "parameterValues">): boolean {
  const declared = node.metadata?.[AUTOMATION_STUDIO_DECLARED_CONSEQUENCES_METADATA_KEY];
  if (Array.isArray(declared) && declared.some((consequence) => typeof consequence === "string" && consequence.length > 0)) return true;
  if (node.metadata?.destructive === true || node.metadata?.externalSideEffect === true || node.metadata?.requiresApproval === true || node.parameterValues?.requiresApproval === true) return true;
  return node.metadata?.effect === "mutate" || node.parameterValues?.effect === "mutate";
}

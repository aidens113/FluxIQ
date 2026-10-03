import type { AutomationStudioFlowNode } from "../../../model/index.ts";
import { automationStudioRouteSignaturesValue, type AutomationStudioRouteSignatures } from "./value.ts";

/** The node metadata key the signatures are kept under. */
export const AUTOMATION_STUDIO_ROUTE_SIGNATURES_METADATA_KEY = "routeSignatures";

/** The signatures a Flow node recorded, read from its metadata. Empty when it recorded none. */
export function automationStudioNodeRouteSignatures(node: Pick<AutomationStudioFlowNode, "metadata">): AutomationStudioRouteSignatures {
  return automationStudioRouteSignaturesValue(node.metadata?.[AUTOMATION_STUDIO_ROUTE_SIGNATURES_METADATA_KEY]) ?? {};
}

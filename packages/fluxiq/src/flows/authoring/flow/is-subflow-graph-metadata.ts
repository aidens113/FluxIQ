import type { JsonObject } from "../../../core/index.ts";
import { AUTOMATION_STUDIO_FLOW_REPRESENTATION_VERSION } from "./representation/index.ts";

/** Recognizes current or exact pre-marker Subflow graph ownership metadata. */
export function isAutomationStudioSubflowGraphMetadata(metadata: JsonObject | undefined): boolean {
  const parentFlowId = typeof metadata?.parentFlowId === "string" ? metadata.parentFlowId.trim() : "";
  const parentSubflowId = typeof metadata?.parentSubflowId === "string" ? metadata.parentSubflowId.trim() : "";
  if (metadata?.subflowGraph !== true || !parentFlowId || !parentSubflowId) return false;
  const hasRepresentationMarker = metadata.flowRepresentationVersion !== undefined || metadata.flowRepresentationKind !== undefined;
  return !hasRepresentationMarker
    || (metadata.flowRepresentationVersion === AUTOMATION_STUDIO_FLOW_REPRESENTATION_VERSION
      && metadata.flowRepresentationKind === "subflow_graph");
}

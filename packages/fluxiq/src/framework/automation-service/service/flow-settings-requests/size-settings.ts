import type { JsonObject } from "../../../../core/index.ts";
import { AUTOMATION_STUDIO_FLOW_SIZE_SETTING, automationStudioFlowMaxNodesPerSubflow, type AutomationStudioFlowArtifact } from "../../../../flows/authoring/model/index.ts";

/**
 * The settings detail with the Flow size setting beside the rest. The detail is
 * the SQL settings row, which has no column for it, and the settings view reads
 * only this: without it a saved size redrew as whatever the view held before
 * the save. A Flow with none reads the default, as every size bound does.
 */
export function withFlowSizeSettings<T extends object>(detail: T | null, flow: AutomationStudioFlowArtifact | null): (T & { flowSizeSettings: JsonObject }) | null {
  if (!detail) return null;
  return { ...detail, [AUTOMATION_STUDIO_FLOW_SIZE_SETTING.metadataKey]: { [AUTOMATION_STUDIO_FLOW_SIZE_SETTING.field]: automationStudioFlowMaxNodesPerSubflow(flow?.metadata) } } as T & { flowSizeSettings: JsonObject };
}

import type { JsonObject } from "../../../../core/index.ts";
import { AUTOMATION_STUDIO_FLOW_SIZE_SETTING } from "./setting.ts";
import { automationStudioFlowSizeSettingIssue } from "./issue.ts";

/**
 * The most nodes one Subflow of this Flow may hold, read from the Flow's
 * metadata. A Flow with no setting, or one that is not a valid value, reads the
 * default rather than refusing: a bad stored value is refused when it is saved.
 */
export function automationStudioFlowMaxNodesPerSubflow(metadata: JsonObject | undefined): number {
  const { metadataKey, field, defaultValue } = AUTOMATION_STUDIO_FLOW_SIZE_SETTING;
  const settings = metadata?.[metadataKey];
  const value = settings && typeof settings === "object" && !Array.isArray(settings) ? (settings as JsonObject)[field] : undefined;
  return automationStudioFlowSizeSettingIssue(value) === undefined ? value as number : defaultValue;
}

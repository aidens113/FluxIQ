import { automationStudioFlowHumanness } from "../flow-settings/index.ts";
import type { AutomationStudioFlowArtifact } from "../../../../flows/authoring/model/index.ts";

/**
 * The settings detail with the Flow's own humanness at `metadata.humanness`.
 * The detail is the SQL row, which has no column for it, so a stored level
 * would never reach a reader without this. A Flow with none is returned as is.
 */
export function withFlowHumanness<T extends object>(detail: T | null, flow: AutomationStudioFlowArtifact | null): T | null {
  const humanness = automationStudioFlowHumanness(flow?.metadata);
  if (!detail || humanness === undefined) return detail;
  return { ...detail, metadata: { ...((detail as { metadata?: object }).metadata ?? {}), humanness } };
}

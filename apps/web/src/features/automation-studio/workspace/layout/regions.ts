import { automationStudioViewDefinition } from "../../views/view-registry";
import type { AutomationWorkspaceRegion } from "./contracts";

const bottomDockViewIds = new Set(["recording-action-preview"]);

export function automationWorkspaceRegionForView(viewId: string): AutomationWorkspaceRegion {
  if (bottomDockViewIds.has(viewId)) return "bottom";
  return automationStudioViewDefinition(viewId)?.region ?? "main";
}

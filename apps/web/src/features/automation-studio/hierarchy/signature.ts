import type { AutomationWorkspacePrefs } from "../workspace/layout";
import type { AutomationHierarchyNode } from "./contracts";

export function automationHierarchySignature(
  customHierarchyNodes: readonly AutomationHierarchyNode[],
  deletedHierarchyIds: readonly string[],
  workspacePrefs: AutomationWorkspacePrefs
): string {
  return JSON.stringify({ customHierarchyNodes, deletedHierarchyIds, workspacePrefs });
}
import type { AutomationHierarchyNode } from "./contracts";

export function automationHierarchyNodeIsSubflowRoot(node: AutomationHierarchyNode): boolean {
  return Boolean(node.flowId && node.kind === "folder" && node.label === "Subflows" && node.metadata?.flowStructure === "subflows");
}

export function automationHierarchyNodeIsSubflowCategory(node: AutomationHierarchyNode): boolean {
  return Boolean(node.flowId && node.kind === "folder" && node.metadata?.flowStructure === "subflow-category" && typeof node.sourceId === "string");
}

export function automationHierarchyNodeCanCreateChildFolder(node: AutomationHierarchyNode): boolean {
  if (node.kind !== "folder" || node.category === "proposal") return false;
  return !automationHierarchyNodeIsGeneratedFlowStructure(node)
    || automationHierarchyNodeIsSubflowRoot(node)
    || automationHierarchyNodeIsSubflowCategory(node);
}

export function automationHierarchyNodeIsGeneratedFlowStructure(node: AutomationHierarchyNode): boolean {
  if (automationHierarchyNodeIsSubflowCategory(node)) return false;
  return Boolean(node.flowId && node.kind !== "flow" && (node.kind === "folder" || node.kind === "flow-object"));
}

export function automationHierarchyNodeCanDelete(node: AutomationHierarchyNode): boolean {
  if (node.kind === "client" || (node.kind === "run" && !node.flowId)) return false;
  if (automationHierarchyNodeIsGeneratedFlowStructure(node)) return false;
  if (node.category === "proposal" && node.kind !== "proposal") return false;
  return true;
}

export type AutomationHierarchyRowActionId = "create-child" | "open-settings" | "delete";

export function automationHierarchyRowActionIds(node: AutomationHierarchyNode): AutomationHierarchyRowActionId[] {
  const actions: AutomationHierarchyRowActionId[] = [];
  if (automationHierarchyNodeCanCreateChildFolder(node)) actions.push("create-child");
  if ((node.kind === "flow" || node.kind === "task") && node.sourceId) actions.push("open-settings");
  if (automationHierarchyNodeCanDelete(node)) actions.push("delete");
  return actions;
}
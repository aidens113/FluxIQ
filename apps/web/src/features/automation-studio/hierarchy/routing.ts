import type { AutomationSelection } from "../shared/selection-contracts";
import { automationStudioViewId, type AutomationStudioViewId } from "../views/view-registry";
import type { AutomationHierarchyNode, AutomationHierarchyViewId } from "./contracts";

export type AutomationHierarchyRoutableViewId = AutomationStudioViewId | "routine-editor";

export type AutomationHierarchyOpenTarget = {
  navigation: "view" | "subflow";
  viewId: AutomationHierarchyRoutableViewId;
  selection: AutomationSelection | null;
  recordingPrimaryKind: "recording" | null;
};

export function automationHierarchySelectionSignature(selection: AutomationSelection | null, activeViewId?: string): string {
  return [
    activeViewId ?? "",
    selection?.kind ?? "",
    selection?.id ?? ""
  ].join("|");
}

export function automationHierarchySelectionSame(left: AutomationSelection | null, right: AutomationSelection): boolean {
  if (!left || left.kind !== right.kind) return false;
  const leftRecord = left as unknown as Record<string, unknown>;
  const rightRecord = right as unknown as Record<string, unknown>;
  const leftKeys = Object.keys(leftRecord);
  const rightKeys = Object.keys(rightRecord);
  return leftKeys.length === rightKeys.length && leftKeys.every((key) => leftRecord[key] === rightRecord[key]);
}

export function automationHierarchySelectionForOpenNode(node: AutomationHierarchyNode): AutomationSelection | null {
  if (node.kind === "task" && node.sourceId) return { kind: "policy", id: node.sourceId };
  if (node.kind === "flow" && node.sourceId) return { kind: "flow", id: node.sourceId };
  if (node.kind === "subflow" && typeof node.metadata?.graphFlowId === "string") {
    return { kind: "flow", id: node.metadata.graphFlowId };
  }
  if (node.kind === "recording" && node.sourceId) return { kind: "recording", id: node.sourceId };
  if (node.kind === "proposal" && node.flowId) return { kind: "flow", id: node.flowId };
  if ((node.kind === "client" || (node.kind === "run" && !node.flowId)) && node.sourceId) {
    return { kind: "workspace", id: node.sourceId as "clients" | "runs" };
  }
  if (node.flowId && node.kind !== "flow" && node.kind !== "subflow" && node.kind !== "recording") {
    return { kind: "flow", id: node.flowId };
  }
  return null;
}

export function automationHierarchyViewIdForOpenNode(node: AutomationHierarchyNode): AutomationHierarchyRoutableViewId {
  if (node.viewId) return canonicalHierarchyViewId(node.viewId);
  if (node.kind === "flow" || node.kind === "task" || node.kind === "subflow") return automationStudioViewId.flowEditor;
  if (node.kind === "routine") return "routine-editor";
  if (node.kind === "recording") return automationStudioViewId.recordingTimeline;
  if (node.kind === "client") return automationStudioViewId.clients;
  if (node.kind === "proposal" || node.kind === "adaptation" || node.kind === "change-proposal") return automationStudioViewId.adaptations;
  if (node.kind === "run") return automationStudioViewId.runtime;
  return automationStudioViewId.settings;
}

export function automationHierarchyOpenTargetForNode(node: AutomationHierarchyNode): AutomationHierarchyOpenTarget {
  return {
    navigation: node.kind === "subflow" ? "subflow" : "view",
    viewId: automationHierarchyViewIdForOpenNode(node),
    selection: automationHierarchySelectionForOpenNode(node),
    recordingPrimaryKind: node.kind === "recording" ? "recording" : null
  };
}

function canonicalHierarchyViewId(viewId: AutomationHierarchyViewId): AutomationHierarchyRoutableViewId {
  if (viewId === "runs-history") return automationStudioViewId.runtime;
  if (viewId === "config" || viewId === "config-default") return automationStudioViewId.settings;
  if (viewId === "proposal-generator" || viewId === "proposal-workbench" || viewId === "pipeline-workbench") {
    return automationStudioViewId.adaptations;
  }
  return viewId;
}
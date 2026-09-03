import { automationStudioViewId } from "../views/view-registry";
import type { AutomationSelection } from "../shared/selection-contracts";
import type { AutomationHierarchyNode } from "./contracts";
import {
  automationHierarchyPrimaryNode,
  automationHierarchySettingsPrimaryNodeId
} from "./selectors";
import {
  automationHierarchyOpenTargetForNode,
  type AutomationHierarchyRoutableViewId
} from "./routing";
import type { AutomationHierarchyStore } from "./store";

export type AutomationHierarchyControllerContext = {
  nodes: AutomationHierarchyNode[];
  activeViewId: string | undefined;
  selection: AutomationSelection | null;
  recordingPrimaryKind: "recording" | null;
  setRecordingPrimaryKind(kind: "recording" | null): void;
  setSelection(selection: AutomationSelection): void;
  openView(viewId: AutomationHierarchyRoutableViewId, mode?: "preview" | "new-pane-or-focus"): void;
  openSubflow?(node: AutomationHierarchyNode, mode: "preview" | "new-pane-or-focus"): void;
  scheduleReconciliation?(commit: () => void): void;
};

export type AutomationHierarchyControllerContextAccessor = () => AutomationHierarchyControllerContext;

export type AutomationHierarchyController = {
  previewPrimaryNode(node: AutomationHierarchyNode): AutomationHierarchyNode;
  openNode(node: AutomationHierarchyNode, mode: "preview" | "new-pane-or-focus"): void;
  openSettings(node: AutomationHierarchyNode): void;
  toggleFolder(nodeId: string): void;
};

export function createAutomationHierarchyController(
  store: AutomationHierarchyStore,
  contextOrAccessor: AutomationHierarchyControllerContext | AutomationHierarchyControllerContextAccessor
): AutomationHierarchyController {
  const readContext: AutomationHierarchyControllerContextAccessor = typeof contextOrAccessor === "function"
    ? contextOrAccessor
    : () => contextOrAccessor;
  const previewPrimaryNode = (
    node: AutomationHierarchyNode,
    context = readContext()
  ): AutomationHierarchyNode => {
    const targetNode = automationHierarchyPrimaryNode(node, context.nodes);
    store.previewPrimary(targetNode.id);
    return targetNode;
  };

  return {
    previewPrimaryNode,
    openNode(node, mode) {
      if (node.kind === "folder") return;
      const context = readContext();
      if (node.metadata?.hierarchyContainer === true) {
        store.expandContainer(node.id, node.metadata?.defaultCollapsed === true);
      }
      const targetNode = previewPrimaryNode(node, context);
      const resolvedTarget = automationHierarchyOpenTargetForNode(targetNode);
      const target = node.kind === "subflow" ? { ...resolvedTarget, navigation: "subflow" as const } : resolvedTarget;
      if (target.navigation === "subflow" && context.openSubflow) {
        context.openSubflow(node, mode);
      } else {
        context.openView(target.viewId, mode);
      }
      const reconcile = () => {
        if (context.recordingPrimaryKind !== target.recordingPrimaryKind) {
          context.setRecordingPrimaryKind(target.recordingPrimaryKind);
        }
        if (target.selection) context.setSelection(target.selection);
      };
      if (context.scheduleReconciliation) context.scheduleReconciliation(reconcile);
      else reconcile();
    },
    openSettings(node) {
      if (!node.sourceId || (node.kind !== "flow" && node.kind !== "task")) return;
      const context = readContext();
      const targetSelection: AutomationSelection = node.kind === "flow"
        ? { kind: "flow", id: node.sourceId }
        : { kind: "policy", id: node.sourceId };
      context.openView(automationStudioViewId.settings, "preview");
      store.previewPrimary(automationHierarchySettingsPrimaryNodeId(node, context.nodes));
      const reconcile = () => {
        if (context.recordingPrimaryKind !== null) context.setRecordingPrimaryKind(null);
        context.setSelection(targetSelection);
      };
      if (context.scheduleReconciliation) context.scheduleReconciliation(reconcile);
      else reconcile();
    },
    toggleFolder(nodeId) {
      const context = readContext();
      const node = context.nodes.find((candidate) => candidate.id === nodeId);
      const activeDefaultExpanded = node?.metadata?.defaultCollapsed === true
        && context.selection?.kind === "flow"
        && context.selection.id === node.metadata.graphFlowId;
      store.toggleFolder(nodeId, node?.metadata?.defaultCollapsed === true, activeDefaultExpanded);
    }
  };
}

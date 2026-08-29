import { automationStudioViewId } from "../views/view-registry";
import type { AutomationSelection } from "../shared/selection-contracts";
import type { AutomationHierarchyNode } from "./contracts";
import {
  automationHierarchyNodeCanRemainPrimary,
  automationHierarchyPrimaryNode,
  automationHierarchySettingsPrimaryNodeId
} from "./selectors";
import {
  automationHierarchyOpenTargetForNode,
  automationHierarchySelectionSame,
  automationHierarchySelectionSignature,
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
  openView(viewId: AutomationHierarchyRoutableViewId, mode?: "preview" | "new-window"): void;
  openSubflow?(node: AutomationHierarchyNode, mode: "preview" | "new-window"): void;
};

export type AutomationHierarchyController = {
  updateContext(context: AutomationHierarchyControllerContext): void;
  previewPrimaryNode(node: AutomationHierarchyNode): AutomationHierarchyNode;
  openNode(node: AutomationHierarchyNode, mode: "preview" | "new-window"): void;
  openSettings(node: AutomationHierarchyNode): void;
  toggleFolder(nodeId: string): void;
  reconcileExternalSelection(): void;
};

export function createAutomationHierarchyController(
  store: AutomationHierarchyStore,
  initialContext: AutomationHierarchyControllerContext
): AutomationHierarchyController {
  let context = initialContext;
  let selectionOrigin: string | null = null;
  let expectedSelectionSignature: string | null = null;

  const externalSignature = () => automationHierarchySelectionSignature(context.selection, context.activeViewId);
  const previewPrimaryNode = (node: AutomationHierarchyNode): AutomationHierarchyNode => {
    const targetNode = automationHierarchyPrimaryNode(node, context.nodes);
    selectionOrigin = externalSignature();
    store.setPrimary(targetNode.id);
    return targetNode;
  };

  return {
    updateContext(nextContext) {
      context = nextContext;
    },
    previewPrimaryNode,
    openNode(node, mode) {
      if (node.kind === "folder") return;
      if (node.metadata?.hierarchyContainer === true) {
        store.expandContainer(node.id, node.metadata?.defaultCollapsed === true);
      }
      const targetNode = previewPrimaryNode(node);
      const resolvedTarget = automationHierarchyOpenTargetForNode(targetNode);
      const target = node.kind === "subflow" ? { ...resolvedTarget, navigation: "subflow" as const } : resolvedTarget;
      expectedSelectionSignature = target.selection
        ? automationHierarchySelectionSignature(target.selection, target.viewId)
        : null;
      if (context.recordingPrimaryKind !== target.recordingPrimaryKind) {
        context.setRecordingPrimaryKind(target.recordingPrimaryKind);
      }
      if (target.selection && !automationHierarchySelectionSame(context.selection, target.selection)) {
        context.setSelection(target.selection);
      }
      if (target.navigation === "subflow" && context.openSubflow) {
        context.openSubflow(node, mode);
        return;
      }
      context.openView(target.viewId, mode);
    },
    openSettings(node) {
      if (!node.sourceId || (node.kind !== "flow" && node.kind !== "task")) return;
      const targetSelection: AutomationSelection = node.kind === "flow"
        ? { kind: "flow", id: node.sourceId }
        : { kind: "policy", id: node.sourceId };
      selectionOrigin = externalSignature();
      expectedSelectionSignature = automationHierarchySelectionSignature(targetSelection, automationStudioViewId.settings);
      store.setPrimary(automationHierarchySettingsPrimaryNodeId(node, context.nodes));
      if (context.recordingPrimaryKind !== null) context.setRecordingPrimaryKind(null);
      if (!automationHierarchySelectionSame(context.selection, targetSelection)) context.setSelection(targetSelection);
      context.openView(automationStudioViewId.settings, "preview");
    },
    toggleFolder(nodeId) {
      const node = context.nodes.find((candidate) => candidate.id === nodeId);
      store.toggleFolder(nodeId, node?.metadata?.defaultCollapsed === true);
    },
    reconcileExternalSelection() {
      const primaryTreeNodeId = store.getSnapshot().primaryTreeNodeId;
      if (primaryTreeNodeId) {
        const primaryNode = context.nodes.find((node) => node.id === primaryTreeNodeId);
        if (!primaryNode) {
          selectionOrigin = null;
          expectedSelectionSignature = null;
          store.setPrimary(null);
        } else {
          const currentSignature = externalSignature();
          if (expectedSelectionSignature) {
            if (expectedSelectionSignature === currentSignature) {
              expectedSelectionSignature = null;
              selectionOrigin = null;
            } else if (automationHierarchyNodeCanRemainPrimary(primaryNode, context.selection)) {
              return;
            }
          }
          if (
            primaryNode.flowId
            && primaryNode.kind !== "flow"
            && primaryNode.viewId
            && context.activeViewId
            && primaryNode.viewId !== context.activeViewId
            && context.selection?.kind === "flow"
            && context.selection.id === primaryNode.flowId
          ) {
            store.setPrimary(null);
          } else if (
            selectionOrigin !== null
            && selectionOrigin !== currentSignature
            && !automationHierarchyNodeCanRemainPrimary(primaryNode, context.selection)
          ) {
            selectionOrigin = null;
            store.setPrimary(null);
          }
        }
      }
      if (!context.recordingPrimaryKind) return;
      const primaryNode = context.selection?.kind === "recording"
        ? context.nodes.find((node) =>
          node.kind === context.recordingPrimaryKind
          && (node.sourceId === context.selection?.id || node.recordingId === context.selection?.id))
        : null;
      store.setPrimary(primaryNode?.id ?? null);
    }
  };
}

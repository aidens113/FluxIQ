"use client";

import { useCallback, useRef } from "react";
import type { AutomationHierarchyAction, AutomationHierarchyNode } from "../hierarchy/model";
import type { AutomationHierarchyDialogTransaction } from "../hierarchy/dialog-transaction";
import type { createAutomationHierarchyCommandExecutor } from "../hierarchy/command-executor";
import type { createAutomationHierarchyDialogStore } from "../hierarchy/dialog-store";
import type { AutomationSelection } from "../shared/selection-contracts";
import type { AutomationWorkspacePrefs } from "../workspace/layout";
import { automationStudioViewId } from "../views/view-registry";
import type { AutomationLiveDomainCommands } from "./domain-commands";
import { automationSelectionSame } from "../model/live-helpers";
import { commitAutomationStudioMutation } from "../stores/mutation-transaction-store";
import { runAutomationPresentationTransaction } from "../presentation/transaction";
import { automationViewStateReferencesAny } from "./view-state-references";

type Options = {
  activeProjectId: string | null;
  nodes: AutomationHierarchyNode[];
  indexes: any;
  selection: AutomationSelection | null;
  projectTasks: any[];
  selectedTaskGraph: any;
  liveCommands: AutomationLiveDomainCommands;
  dialogStore: ReturnType<typeof createAutomationHierarchyDialogStore>;
  executor: ReturnType<typeof createAutomationHierarchyCommandExecutor>;
  projectDataPlatform: { remember(projectId: string, kind: "flow", id: string, value: any): void };
  deleteRecordings: (ids: string[], pin: string) => Promise<boolean>;
  notifyChanged: (scopes: any[], ids?: string[]) => void;
  clearFlowDrafts: (flowId: string) => void;
  openView: (viewId: string, mode?: "preview" | "new-pane-or-focus") => void;
  openSubflow: (flowId: string, subflowId: string, mode: "preview" | "new-pane-or-focus", graphFlowId?: string) => Promise<void>;
  setSelection: (next: any) => void;
  updatePrefs: (updater: (current: AutomationWorkspacePrefs) => AutomationWorkspacePrefs, options?: { persist?: boolean }) => void;
  setProjectFlows: (next: any) => void;
  setCustomNodes: (next: any) => void;
  setDeletedIds: (next: any) => void;
  requestSave: () => void;
  getSnapshot?: () => Pick<Options, "activeProjectId" | "nodes" | "indexes" | "selection" | "projectTasks" | "selectedTaskGraph">;
};

export function useAutomationHierarchyCommandBridge(options: Options) {
  const ref = useRef(options);
  ref.current = options;
  const stable = useCallback(<Args extends unknown[], Result>(handler: (current: Options, ...args: Args) => Result) => (
    (...args: Args) => handler(ref.current, ...args)
  ), []);
  const setTreeSelection = useCallback((next: AutomationSelection) => {
    runAutomationPresentationTransaction(() => {
      options.setSelection((current: AutomationSelection | null) => automationSelectionSame(current, next) ? current : next);
    });
  }, [options.setSelection]);
  const closeDeletedViews = stable((source, deletingNodes: AutomationHierarchyNode[]) => {
    const current = withSnapshot(source);
    const sourceIds = new Set(deletingNodes.map((node) => node.sourceId).filter((id): id is string => Boolean(id)));
    if (current.selection && "id" in current.selection && sourceIds.has(String(current.selection.id))) current.setSelection(null);
    current.updatePrefs((prefs) => ({
      ...prefs,
      viewStates: Object.fromEntries(Object.entries(prefs.viewStates ?? {}).filter(
        ([, state]) => !automationViewStateReferencesAny(state, sourceIds)
      ))
    }), { persist: true });
  });
  const execute = stable((source, transaction: AutomationHierarchyDialogTransaction) => {
    const current = withSnapshot(source);
    return current.executor.execute(transaction, {
    projectId: current.activeProjectId,
    nodes: current.nodes,
    nodeById: current.indexes.hierarchyNodeById,
    canonicalFlowIds: new Set(current.indexes.canonicalFlowEntryById.keys()),
    selection: current.selection,
    projectTasks: current.projectTasks,
    commands: {
      createFlow: (input) => current.liveCommands.createFlowDocument(input),
      saveFlow: (input) => current.liveCommands.saveFlowDocument(input),
      loadFlow: (flowId) => current.liveCommands.getFlowDocument(flowId),
      deleteFlow: (flowId, pin) => current.liveCommands.deleteFlowDocument(flowId, pin),
      createSubflow: (input) => current.liveCommands.createFlowSubflow(input),
      deleteSubflow: (input) => current.liveCommands.deleteFlowSubflow(input),
      deleteArtifact: (input) => current.liveCommands.deleteProjectArtifact(input)
    },
    deleteRecordings: current.deleteRecordings,
    findLocalFlow: (flowId) => current.indexes.canonicalFlowEntryById.get(flowId)?.flow ?? null,
    rememberFlow(flowId, flow) {
      if (current.activeProjectId) current.projectDataPlatform.remember(current.activeProjectId, "flow", flowId, flow);
    },
    commitSubflowChanged(flowId, subflowId) {
      if (current.activeProjectId) commitAutomationStudioMutation({
        kind: "subflow.changed", projectId: current.activeProjectId, flowId, ...(subflowId ? { subflowId } : {})
      });
    },
    notifyChanged: current.notifyChanged,
    openCreatedFlow(flowId) { selectCreated(current, flowId); },
    openCreatedSubflow(flowId) { selectCreated(current, flowId); },
    closeDeletedViews,
    clearFlowDrafts: current.clearFlowDrafts,
    setSelection: current.setSelection,
    updateProjectFlows: current.setProjectFlows,
    updateCustomNodes(update) {
      current.setCustomNodes(update);
      current.requestSave();
    },
    updateDeletedIds(update) {
      current.setDeletedIds(update);
      current.requestSave();
    }
    });
  });
  const requestAction = stable((source, action: NonNullable<AutomationHierarchyAction>) => {
    const current = withSnapshot(source);
    current.dialogStore.request(action, current.indexes.hierarchyNodeById);
  });
  const openTreeView = stable((current, viewId: string, mode: "preview" | "new-pane-or-focus" = "preview") => {
    current.openView(viewId, mode);
  });
  const openTreeSubflow = stable((current, node: AutomationHierarchyNode, mode: "preview" | "new-pane-or-focus") => {
    if (node.flowId && node.sourceId) void current.openSubflow(
      node.flowId, node.sourceId, mode,
      typeof node.metadata?.graphFlowId === "string" ? node.metadata.graphFlowId : undefined
    );
  });
  const createSubflow = stable((source) => {
    const current = withSnapshot(source);
    const root = current.selectedTaskGraph?.flowId
      ? current.indexes.subflowRootByFlowId.get(current.selectedTaskGraph.flowId)
      : undefined;
    if (root) current.dialogStore.request(
      { action: "create", category: "flow", parentId: root.id },
      current.indexes.hierarchyNodeById
    );
  });
  return { createSubflow, execute, openTreeSubflow, openTreeView, requestAction, setTreeSelection };
}

function withSnapshot(options: Options): Options {
  return options.getSnapshot ? { ...options, ...options.getSnapshot() } : options;
}

function selectCreated(options: Options, flowId: string): void {
  runAutomationPresentationTransaction(() => {
    options.setSelection({ kind: "flow", id: flowId });
    options.openView(automationStudioViewId.flowEditor, "preview");
  });
}

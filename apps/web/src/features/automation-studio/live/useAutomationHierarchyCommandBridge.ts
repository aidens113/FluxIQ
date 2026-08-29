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
  schedule: (commit: () => void) => void;
  openView: (viewId: string, mode?: "preview" | "new-window") => void;
  openSubflow: (flowId: string, subflowId: string, mode: "preview" | "new-window", graphFlowId?: string) => Promise<void>;
  setSelection: (next: any) => void;
  updatePrefs: (updater: (current: AutomationWorkspacePrefs) => AutomationWorkspacePrefs, options?: { persist?: boolean }) => void;
  setProjectFlows: (next: any) => void;
  setCustomNodes: (next: any) => void;
  setDeletedIds: (next: any) => void;
};

export function useAutomationHierarchyCommandBridge(options: Options) {
  const ref = useRef(options);
  ref.current = options;
  const stable = useCallback(<Args extends unknown[], Result>(handler: (current: Options, ...args: Args) => Result) => (
    (...args: Args) => handler(ref.current, ...args)
  ), []);
  const setTreeSelection = useCallback((next: AutomationSelection) => {
    options.schedule(() => options.setSelection((current: AutomationSelection | null) => automationSelectionSame(current, next) ? current : next));
  }, [options.schedule, options.setSelection]);
  const closeDeletedViews = useCallback((deletingNodes: AutomationHierarchyNode[]) => {
    const sourceIds = new Set(deletingNodes.map((node) => node.sourceId).filter((id): id is string => Boolean(id)));
    if (options.selection && "id" in options.selection && sourceIds.has(String(options.selection.id))) options.setSelection(null);
    options.updatePrefs((current) => ({
      ...current,
      viewStates: Object.fromEntries(Object.entries(current.viewStates ?? {}).filter(([, state]) => {
        const serialized = JSON.stringify(state);
        return ![...sourceIds].some((id) => serialized.includes(id));
      }))
    }), { persist: true });
  }, [options]);
  const execute = stable((current, transaction: AutomationHierarchyDialogTransaction) => current.executor.execute(transaction, {
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
    updateCustomNodes: current.setCustomNodes,
    updateDeletedIds: current.setDeletedIds
  }));
  const requestAction = stable((current, action: NonNullable<AutomationHierarchyAction>) => {
    current.dialogStore.request(action, current.indexes.hierarchyNodeById);
  });
  const openTreeView = stable((current, viewId: string, mode: "preview" | "new-window" = "preview") => current.openView(viewId, mode));
  const openTreeSubflow = stable((current, node: AutomationHierarchyNode, mode: "preview" | "new-window") => {
    if (node.flowId && node.sourceId) void current.openSubflow(
      node.flowId, node.sourceId, mode,
      typeof node.metadata?.graphFlowId === "string" ? node.metadata.graphFlowId : undefined
    );
  });
  const createSubflow = useCallback(() => {
    const root = options.selectedTaskGraph?.flowId ? options.indexes.subflowRootByFlowId.get(options.selectedTaskGraph.flowId) : undefined;
    if (root) options.dialogStore.request({ action: "create", category: "flow", parentId: root.id }, options.indexes.hierarchyNodeById);
  }, [options]);
  return { createSubflow, execute, openTreeSubflow, openTreeView, requestAction, setTreeSelection };
}

function selectCreated(options: Options, flowId: string): void {
  options.schedule(() => {
    options.setSelection({ kind: "flow", id: flowId });
    options.openView(automationStudioViewId.flowEditor, "preview");
  });
}
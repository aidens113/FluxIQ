"use client";

import type { AutomationSelection } from "../shared/selection-contracts";
import { automationStudioViewId } from "../views/view-registry";
import { useDirtyViewRegistration } from "../workspace/DirtyViewGuard";
import { requestDirtyViewDecision } from "../workspace/dirty-view-registry";
import type { useAutomationGraphRuntime } from "./useAutomationGraphRuntime";
import { useStableAutomationEvent } from "./useStableAutomationEvent";

type GraphRuntime = ReturnType<typeof useAutomationGraphRuntime>;

export function useAutomationSessionDirtyGuards(options: {
  activeProjectId: string | null;
  selectedTaskGraph: any;
  selectedFlow: any;
  hasDirtyTaskGraph: boolean;
  graphRuntime: GraphRuntime;
  setDirty(dirty: boolean): void;
  closeProject(): void;
  setTreeSelection(next: AutomationSelection): void;
  afterTreeSelection?(): void;
}) {
  useDirtyViewRegistration({
    id: `flow-graph:${options.activeProjectId ?? "none"}:${options.selectedTaskGraph?.flowId ?? "none"}`,
    viewId: automationStudioViewId.flowEditor,
    label: `Node graph: ${options.selectedTaskGraph?.name ?? options.selectedFlow?.name ?? "current Flow"}`,
    dirty: options.hasDirtyTaskGraph,
    save: async () => { if (options.graphRuntime.draft) await options.graphRuntime.saveGraph(options.graphRuntime.draft); },
    discard: () => {
      options.graphRuntime.updateDraft(null);
      options.graphRuntime.discardDraft();
      options.setDirty(false);
    }
  });
  const guardExit = useStableAutomationEvent((actionLabel: string, proceed: () => void) => {
    requestDirtyViewDecision({ actionLabel, proceed });
  });
  const guardedCloseProject = useStableAutomationEvent(() => guardExit("closing the project", options.closeProject));
  const selectTreeItem = useStableAutomationEvent((next: AutomationSelection) => completeTreeSelection(options.setTreeSelection, options.afterTreeSelection, next));
  return { guardedCloseProject, selectTreeItem };
}

export function completeTreeSelection(
  setTreeSelection: (next: AutomationSelection) => void,
  afterTreeSelection: (() => void) | undefined,
  next: AutomationSelection,
): void {
  setTreeSelection(next);
  afterTreeSelection?.();
}

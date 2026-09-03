"use client";

import type { AutomationSelection } from "../shared/selection-contracts";
import { automationStudioViewId } from "../views/view-registry";
import { useDirtyViewRegistration } from "../workspace/DirtyViewGuard";
import { requestDirtyViewDecision } from "../workspace/dirty-view-registry";
import { saveActiveAutomationStudioGraph } from "../workspace/studio-action-registry";
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
    save: async (authorizationPin) => {
      if (!authorizationPin) throw new Error("A security PIN is required to save the graph.");
      const activeEditorSave = saveActiveAutomationStudioGraph(authorizationPin);
      const result = activeEditorSave
        ? await activeEditorSave
        : options.graphRuntime.draft
          ? await options.graphRuntime.saveGraph(options.graphRuntime.draft, authorizationPin)
          : { ok: false, message: "The current graph draft is unavailable." };
      if (!result.ok) throw new Error(result.message);
    },
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

"use client";

import type { AutomationSelection } from "../../shared/selection-contracts";
import { automationStudioViewId } from "../../views/view-registry";
import { useDirtyViewRegistration } from "../../workspace/DirtyViewGuard";
import { requestDirtyViewDecision } from "../../workspace/dirty-view-registry";
import { saveActiveAutomationStudioGraph } from "../../workspace/studio-action-registry";
import type { useAutomationGraphRuntime } from "./useAutomationGraphRuntime";
import { useStableAutomationEvent } from "./useStableAutomationEvent";
import { useAutomationProjectResource, type AutomationStudioStores } from "../../stores";

type GraphRuntime = ReturnType<typeof useAutomationGraphRuntime>;

export function useAutomationSessionDirtyGuards(options: {
  activeProjectId: string | null;
  stores: AutomationStudioStores;
  selectedTaskGraph: any;
  selectedFlow: any;
  graphRuntime: GraphRuntime;
  setDirty(dirty: boolean): void;
  closeProject(): void;
  setTreeSelection(next: AutomationSelection): void;
  afterTreeSelection?(): void;
}) {
  const hasDirtyTaskGraph = useAutomationProjectResource(options.stores, "hasDirtyTaskGraph", false);
  useDirtyViewRegistration({
    id: `flow-graph:${options.activeProjectId ?? "none"}:${options.selectedTaskGraph?.flowId ?? "none"}`,
    viewId: automationStudioViewId.flowEditor,
    label: `Node graph: ${options.selectedTaskGraph?.name ?? options.selectedFlow?.name ?? "current Flow"}`,
    dirty: hasDirtyTaskGraph,
    // Saving the node graph is ordinary editing, so it no longer asks for a
    // PIN: Core registers every endpoint a graph save touches as `authoring`,
    // and only `destructive` endpoints are PIN-checked. The empty string keeps
    // the wire shape the save commands already have.
    save: async () => {
      const activeEditorSave = saveActiveAutomationStudioGraph("");
      const result = activeEditorSave
        ? await activeEditorSave
        : options.graphRuntime.draft
          ? await options.graphRuntime.saveGraph(options.graphRuntime.draft, "")
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

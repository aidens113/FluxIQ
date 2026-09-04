"use client";

import type { AutomationSelection } from "../shared/selection-contracts";
import { automationStudioObjectViewInstanceId, automationStudioViewId } from "../views/view-registry";
import { useStableAutomationEvent } from "./useStableAutomationEvent";

type WorkspacePrefs = { viewStates?: Record<string, Record<string, unknown>> };
type ReadinessTarget = "instructions" | "router" | "nodes" | "subflows";

export function useAdaptationWorkspaceNavigation(options: {
  selectedFlowId?: string;
  updatePrefs(update: (current: WorkspacePrefs) => WorkspacePrefs, options?: { persist?: boolean }): void;
  openView(viewId: string, mode?: "preview" | "new-pane-or-focus"): void;
  openProblems(): void;
  setSelection(selection: AutomationSelection): void;
}) {
  function persistSelection(flowId: string | undefined, adaptationId: string) {
    options.updatePrefs((current) => {
      const instanceId = automationStudioObjectViewInstanceId(automationStudioViewId.adaptations, flowId);
      const currentState = current.viewStates?.[instanceId] ?? {};
      if (currentState.flowId === flowId && currentState.selectedAdaptationId === adaptationId) return current;
      return {
        ...current,
        viewStates: {
          ...current.viewStates,
          [instanceId]: { ...currentState, flowId, selectedAdaptationId: adaptationId }
        }
      };
    }, { persist: true });
  }

  const openAdaptation = useStableAutomationEvent((flowId: string | undefined, adaptationId: string) => {
    persistSelection(flowId, adaptationId);
    if (flowId && flowId !== options.selectedFlowId) options.setSelection({ kind: "flow", id: flowId });
    options.openView(automationStudioViewId.adaptations, "preview");
  });
  const selectAdaptation = useStableAutomationEvent((adaptationId: string) => {
    persistSelection(options.selectedFlowId, adaptationId);
  });
  const openReadinessTarget = useStableAutomationEvent((target: ReadinessTarget) => {
    options.openView(target === "instructions"
      ? automationStudioViewId.instructions
      : target === "router"
        ? automationStudioViewId.router
        : target === "subflows"
          ? automationStudioViewId.subflows
          : automationStudioViewId.flowEditor, "preview");
  });

  return { openAdaptation, openReadinessTarget, selectAdaptation };
}

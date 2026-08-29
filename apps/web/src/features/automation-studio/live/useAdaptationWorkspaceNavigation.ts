"use client";

import type { AutomationSelection } from "../shared/selection-contracts";
import { automationStudioViewId } from "../views/view-registry";
import { useStableAutomationEvent } from "./useStableAutomationEvent";

type WorkspacePrefs = { viewStates?: Record<string, Record<string, unknown>> };
type ReadinessTarget = "problems" | "instructions" | "router" | "nodes";

export function useAdaptationWorkspaceNavigation(options: {
  selectedFlowId?: string;
  updatePrefs(update: (current: WorkspacePrefs) => WorkspacePrefs): void;
  openView(viewId: string, mode?: "preview" | "new-window"): void;
  openProblems(): void;
  setSelection(selection: AutomationSelection): void;
}) {
  function persistSelection(flowId: string | undefined, adaptationId: string) {
    options.updatePrefs((current) => {
      const currentState = current.viewStates?.[automationStudioViewId.adaptations] ?? {};
      if (currentState.flowId === flowId && currentState.selectedAdaptationId === adaptationId) return current;
      return {
        ...current,
        viewStates: {
          ...current.viewStates,
          [automationStudioViewId.adaptations]: { ...currentState, flowId, selectedAdaptationId: adaptationId }
        }
      };
    });
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
    if (target === "problems") return options.openProblems();
    options.openView(target === "instructions"
      ? automationStudioViewId.instructions
      : target === "router"
        ? automationStudioViewId.router
        : automationStudioViewId.flowEditor, "preview");
  });

  return { openAdaptation, openReadinessTarget, selectAdaptation };
}
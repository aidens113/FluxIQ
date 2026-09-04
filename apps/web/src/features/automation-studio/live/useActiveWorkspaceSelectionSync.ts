"use client";

import { useEffect, useRef } from "react";
import type { AutomationSelection } from "../shared/selection-contracts";
import type { AutomationWorkspacePrefs } from "../workspace/layout";
import { automationSelectionSame } from "../model/live-helpers";
import { automationActiveWorkspaceSelection } from "./active-workspace-selection";
import { bindAutomationActiveFlowView } from "./active-workspace-selection";

export function useActiveWorkspaceSelectionSync(
  prefs: AutomationWorkspacePrefs,
  selection: AutomationSelection | null,
  setSelection: (selection: AutomationSelection) => void,
  updatePrefs: (
    update: (prefs: AutomationWorkspacePrefs) => AutomationWorkspacePrefs,
    options: { persist: true }
  ) => void
): void {
  const selectionRef = useRef(selection);
  selectionRef.current = selection;
  const activePane = prefs.panes.find((pane) => pane.id === prefs.activePaneId) ?? prefs.panes[0];
  const activeViewId = activePane?.activeViewId ?? prefs.activeViewId;
  const savedSelection = automationActiveWorkspaceSelection(prefs, null);

  useEffect(() => {
    const activeState = prefs.viewStates?.[activeViewId];
    const activeIsUnbound = !activeState?.flowId && !activeState?.selection;
    if (activeIsUnbound && selectionRef.current) {
      updatePrefs((current) => bindAutomationActiveFlowView(current, selectionRef.current!), { persist: true });
    }
    if (savedSelection && !automationSelectionSame(selectionRef.current, savedSelection)) setSelection(savedSelection);
  }, [activePane?.id, activeViewId, prefs.viewStates, savedSelection, setSelection, updatePrefs]);
}

import type { AutomationWorkspacePrefs } from "../workspace/layout";

export type AutomationWorkspaceViewRegistration = {
  activeViewId: string;
  openViewIds: string[];
};

export function selectAutomationWorkspaceViewRegistration(
  prefs: AutomationWorkspacePrefs
): AutomationWorkspaceViewRegistration {
  const activePane = prefs.panes.find((pane) => pane.id === prefs.activePaneId) ?? prefs.panes[0];
  return {
    activeViewId: activePane?.activeViewId ?? prefs.activeViewId,
    openViewIds: [...new Set([
      ...prefs.panes.flatMap((pane) => pane.tabs),
      ...prefs.rightSidebar.tabs
    ])]
  };
}

export function automationWorkspaceViewRegistrationEqual(
  left: AutomationWorkspaceViewRegistration,
  right: AutomationWorkspaceViewRegistration
): boolean {
  return left.activeViewId === right.activeViewId
    && left.openViewIds.length === right.openViewIds.length
    && left.openViewIds.every((viewId, index) => viewId === right.openViewIds[index]);
}

import type { AutomationWorkspacePrefs, AutomationWorkspaceRegion } from "../layout/contracts";

export type AutomationWorkspaceOpenMode = "preview" | "new-window";
export type AutomationWorkspaceTabPlacement = "before" | "after" | "end";

export type AutomationWorkspaceCommitOptions = {
  persist?: boolean;
  scope?: string;
};

export type AutomationWorkspaceCommandPort = {
  read(): AutomationWorkspacePrefs;
  commit(
    update: (current: AutomationWorkspacePrefs) => AutomationWorkspacePrefs,
    options?: AutomationWorkspaceCommitOptions
  ): boolean;
  schedule?(operation: () => void): void;
};

export type AutomationWorkspaceWarmActivator = {
  activate(region: Exclude<AutomationWorkspaceRegion, "bottom">, paneId: string, viewId: string): boolean;
};

export type AutomationWorkspaceRegionActivation = {
  region: AutomationWorkspaceRegion;
  paneId: string;
  viewId: string;
};

export type AutomationWorkspaceCommands = {
  openView(viewId: string, mode?: AutomationWorkspaceOpenMode): boolean;
  activatePane(paneId: string): boolean;
  selectPaneTab(paneId: string, viewId: string): boolean;
  addPaneTab(paneId: string, viewId: string): boolean;
  closePaneTab(paneId: string, viewId: string): boolean;
  movePaneTab(
    sourcePaneId: string,
    targetPaneId: string,
    viewId: string,
    targetViewId?: string | null,
    placement?: AutomationWorkspaceTabPlacement
  ): boolean;
  movePaneTabByKeyboard(paneId: string, viewId: string, direction: -1 | 1): boolean;
  selectRightTab(viewId: string): boolean;
  addRightTab(viewId: string): boolean;
  closeRightTab(viewId: string): boolean;
  applyLayoutPreset(preset: AutomationWorkspacePrefs["mainLayoutPreset"]): boolean;
  toggleRightSidebar(): boolean;
  toggleTimeline(): boolean;
};

import { normalizeAutomationWorkspacePrefs, type AutomationWorkspacePrefs } from "../workspace/layout";

export function persistentAutomationWorkspacePrefs(prefs: AutomationWorkspacePrefs): AutomationWorkspacePrefs {
  return normalizeAutomationWorkspacePrefs({
    ...prefs,
    panes: prefs.panes,
    rightSidebar: prefs.rightSidebar,
    viewStates: prefs.viewStates
  });
}

export function automationWorkspacePrefsSameRuntimeState(left: AutomationWorkspacePrefs, right: AutomationWorkspacePrefs): boolean {
  return left.activePaneId === right.activePaneId
    && left.activeViewId === right.activeViewId
    && left.maximizedWindowId === right.maximizedWindowId
    && left.sidebarWidth === right.sidebarWidth
    && left.leftSidebarCollapsed === right.leftSidebarCollapsed
    && left.inspectorWidth === right.inspectorWidth
    && left.bottomTimelineHeight === right.bottomTimelineHeight
    && left.bottomTimelineCollapsed === right.bottomTimelineCollapsed
    && left.mainLayoutPreset === right.mainLayoutPreset
    && left.rightSidebarCollapsed === right.rightSidebarCollapsed
    && left.density === right.density
    && left.motion === right.motion
    && automationWorkspacePaneListKey(left.panes) === automationWorkspacePaneListKey(right.panes)
    && automationWorkspaceRightSidebarKey(left.rightSidebar) === automationWorkspaceRightSidebarKey(right.rightSidebar)
    && automationWorkspaceBottomDockKey(left.bottomDock) === automationWorkspaceBottomDockKey(right.bottomDock)
    && JSON.stringify(left.mainSplitRatios) === JSON.stringify(right.mainSplitRatios)
    && automationWorkspaceViewStatesSameRuntimeState(left.viewStates, right.viewStates);
}

export function automationWorkspacePrefsSameNonActivePersistentState(left: AutomationWorkspacePrefs, right: AutomationWorkspacePrefs): boolean {
  return left.maximizedWindowId === right.maximizedWindowId
    && left.sidebarWidth === right.sidebarWidth
    && left.leftSidebarCollapsed === right.leftSidebarCollapsed
    && left.inspectorWidth === right.inspectorWidth
    && left.bottomTimelineHeight === right.bottomTimelineHeight
    && left.bottomTimelineCollapsed === right.bottomTimelineCollapsed
    && left.mainLayoutPreset === right.mainLayoutPreset
    && left.rightSidebarCollapsed === right.rightSidebarCollapsed
    && left.density === right.density
    && left.motion === right.motion
    && automationWorkspacePaneListNonActiveKey(left.panes) === automationWorkspacePaneListNonActiveKey(right.panes)
    && automationWorkspaceRightSidebarNonActiveKey(left.rightSidebar) === automationWorkspaceRightSidebarNonActiveKey(right.rightSidebar)
    && automationWorkspaceBottomDockNonActiveKey(left.bottomDock) === automationWorkspaceBottomDockNonActiveKey(right.bottomDock)
    && JSON.stringify(left.mainSplitRatios) === JSON.stringify(right.mainSplitRatios)
    && automationWorkspaceViewStatesSameRuntimeState(left.viewStates, right.viewStates);
}

export function automationWorkspaceViewStatesSameRuntimeState(left: AutomationWorkspacePrefs["viewStates"], right: AutomationWorkspacePrefs["viewStates"]): boolean {
  if (left === right) return true;
  const leftEntries = Object.entries(left ?? {});
  const rightEntries = Object.entries(right ?? {});
  if (leftEntries.length !== rightEntries.length) return false;
  const rightById = new Map(rightEntries);
  for (const [viewId, leftState] of leftEntries) {
    if (!automationWorkspaceViewStateSameRuntimeState(leftState, rightById.get(viewId))) return false;
  }
  return true;
}

function automationWorkspaceViewStateSameRuntimeState(left: Record<string, unknown> | undefined, right: Record<string, unknown> | undefined): boolean {
  if (left === right) return true;
  const leftKeys = Object.keys(left ?? {}).sort();
  const rightKeys = Object.keys(right ?? {}).sort();
  if (leftKeys.length !== rightKeys.length) return false;
  for (let index = 0; index < leftKeys.length; index += 1) {
    const key = leftKeys[index]!;
    if (key !== rightKeys[index]) return false;
    if (left?.[key] !== right?.[key]) return false;
  }
  return true;
}
function automationWorkspacePaneListKey(panes: AutomationWorkspacePrefs["panes"]): string {
  return panes.map((pane) => `${pane.id}:${pane.activeViewId}:${pane.tabs.join(",")}`).join("|");
}

function automationWorkspacePaneListNonActiveKey(panes: AutomationWorkspacePrefs["panes"]): string {
  return panes.map((pane) => `${pane.id}:${pane.tabs.join(",")}`).join("|");
}

function automationWorkspaceRightSidebarKey(rightSidebar: AutomationWorkspacePrefs["rightSidebar"]): string {
  return `${rightSidebar.activeViewId}:${rightSidebar.collapsed === true}:${rightSidebar.tabs.join(",")}`;
}

function automationWorkspaceRightSidebarNonActiveKey(rightSidebar: AutomationWorkspacePrefs["rightSidebar"]): string {
  return `${rightSidebar.collapsed === true}:${rightSidebar.tabs.join(",")}`;
}

function automationWorkspaceBottomDockKey(bottomDock: AutomationWorkspacePrefs["bottomDock"]): string {
  return `${bottomDock.activeViewId}:${bottomDock.expanded === true}`;
}

function automationWorkspaceBottomDockNonActiveKey(bottomDock: AutomationWorkspacePrefs["bottomDock"]): string {
  return `${bottomDock.expanded === true}`;
}


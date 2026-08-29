import { automationStudioViewId } from "../../views/view-registry";
import type { AutomationBottomDockPrefs, AutomationLayoutPresetOption, AutomationRightSidebarPrefs, AutomationStrictMainLayoutPreset, AutomationWorkspacePane, AutomationWorkspacePrefs, AutomationWorkspaceWindow } from "./contracts";

export const automationLayoutPresetOptions: AutomationLayoutPresetOption[] = [
  { id: "single", label: "Full", title: "Full stack", cells: [{ x: 0, y: 0, w: 1, h: 1 }] },
  { id: "two-columns", label: "Halves", title: "Two equal columns", cells: [{ x: 0, y: 0, w: 0.5, h: 1 }, { x: 0.5, y: 0, w: 0.5, h: 1 }] },
  { id: "two-rows", label: "1:1", title: "Two equal rows", cells: [{ x: 0, y: 0, w: 1, h: 0.5 }, { x: 0, y: 0.5, w: 1, h: 0.5 }] },
  { id: "main-sidebar", label: "2/3", title: "Main plus side stack", cells: [{ x: 0, y: 0, w: 0.67, h: 1 }, { x: 0.67, y: 0, w: 0.33, h: 1 }] },
  { id: "three-columns", label: "Thirds", title: "Three equal columns", cells: [{ x: 0, y: 0, w: 1 / 3, h: 1 }, { x: 1 / 3, y: 0, w: 1 / 3, h: 1 }, { x: 2 / 3, y: 0, w: 1 / 3, h: 1 }] },
  { id: "quad", label: "Grid", title: "Four quadrant grid", cells: [{ x: 0, y: 0, w: 0.5, h: 0.5 }, { x: 0.5, y: 0, w: 0.5, h: 0.5 }, { x: 0, y: 0.5, w: 0.5, h: 0.5 }, { x: 0.5, y: 0.5, w: 0.5, h: 0.5 }] }
];

export const automationStrictMainLayoutPresets: Array<{ id: AutomationStrictMainLayoutPreset; label: string; title: string }> = [
  { id: "single", label: "Full", title: "One main editor pane" },
  { id: "two-even", label: "1/2", title: "Two equal editor panes" },
  { id: "two-main-side", label: "2/3", title: "Large editor plus side pane" },
  { id: "three-even", label: "1/3", title: "Three equal editor panes" },
  { id: "three-main-two", label: "1/2 + 1/4", title: "Large editor plus two side panes" },
  { id: "two-rows", label: "Rows", title: "Two stacked editor panes" }
];

export const automationBottomDockMinHeight = 165;
export const automationBottomDockDefaultHeight = 220;
export const automationBottomDockMaxHeight = 420;

export function defaultAutomationWorkspacePanes(): AutomationWorkspacePane[] {
  return [{ id: "pane-main-1", activeViewId: automationStudioViewId.flowEditor, tabs: [automationStudioViewId.flowEditor] }];
}

export function defaultAutomationRightSidebarPrefs(collapsed = false): AutomationRightSidebarPrefs {
  return { activeViewId: automationStudioViewId.inspector, tabs: [automationStudioViewId.inspector], collapsed };
}

export function defaultAutomationBottomDockPrefs(expanded = false): AutomationBottomDockPrefs {
  return { activeViewId: "recording-action-preview", expanded };
}

export function defaultAutomationWorkspaceWindows(): AutomationWorkspaceWindow[] {
  return [];
}

export function defaultAutomationWorkspacePrefs(): AutomationWorkspacePrefs {
  return {
    layoutVersion: 4,
    windows: [],
    activeWindowId: "",
    activePaneId: "pane-main-1",
    activeViewId: automationStudioViewId.flowEditor,
    maximizedWindowId: null,
    sidebarWidth: 280,
    leftSidebarCollapsed: false,
    inspectorWidth: 320,
    bottomTimelineHeight: automationBottomDockDefaultHeight,
    bottomTimelineCollapsed: true,
    mainLayoutPreset: "single",
    mainSplitRatios: [1],
    panes: defaultAutomationWorkspacePanes(),
    rightSidebar: defaultAutomationRightSidebarPrefs(false),
    bottomDock: defaultAutomationBottomDockPrefs(false),
    utilityWindowsMigrated: true,
    rightSidebarCollapsed: false,
    viewStates: {},
    density: "comfortable",
    motion: "system"
  };
}

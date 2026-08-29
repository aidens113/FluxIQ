export type AutomationWorkspaceWindow = {
  id: string;
  activeViewId: string;
  tabs: string[];
  area: AutomationWorkspaceArea;
  xPct: number;
  yPct: number;
  widthPct: number;
  heightPct: number;
  zIndex: number;
};
export type AutomationWindowPixelGeometry = { x: number; y: number; widthPx: number; heightPx: number };
export type AutomationWindowRelativeGeometry = Pick<AutomationWorkspaceWindow, "xPct" | "yPct" | "widthPct" | "heightPct">;
export type AutomationWorkspaceWindowPixels = AutomationWorkspaceWindow & AutomationWindowPixelGeometry;
export type AutomationWorkspaceArea = "main" | "right";
export type AutomationWindowAdderState = {
  area: AutomationWorkspaceArea;
  targetWindowId?: string;
  anchor: { top: number; right: number; bottom: number; left: number };
};
export type AutomationLayoutPickerState = {
  area: AutomationWorkspaceArea;
  anchor: { top: number; right: number; bottom: number; left: number };
};
export type AutomationWindowResizeEdge = "north" | "east" | "south" | "west" | "north-east" | "north-west" | "south-east" | "south-west";
export type AutomationSharedResizePartner = {
  id: string;
  side: "north" | "east" | "south" | "west";
  start: AutomationWindowPixelGeometry;
};
export type AutomationDragSelectBox = { left: number; top: number; width: number; height: number };
export type AutomationSnapRegion = "left" | "right" | "top" | "bottom";
export type AutomationLayoutPreset = "single" | "two-columns" | "two-rows" | "main-sidebar" | "three-columns" | "quad";
export type AutomationStrictMainLayoutPreset = "single" | "two-even" | "two-main-side" | "three-even" | "three-main-two" | "two-rows";
export type AutomationWorkspaceRegion = "main" | "right" | "bottom";
export type AutomationWorkspaceDensity = "comfortable" | "compact";
export type AutomationWorkspaceMotion = "system" | "reduce";
export type AutomationWorkspacePane = {
  id: string;
  activeViewId: string;
  tabs: string[];
};
export type AutomationRightSidebarPrefs = {
  activeViewId: string;
  tabs: string[];
  collapsed: boolean;
};
export type AutomationBottomDockPrefs = {
  activeViewId: "recording-action-preview";
  expanded: boolean;
};
export type AutomationLayoutPresetOption = {
  id: AutomationLayoutPreset;
  label: string;
  title: string;
  cells: Array<{ x: number; y: number; w: number; h: number }>;
};
export type AutomationWorkspacePrefs = {
  layoutVersion: 2 | 3 | 4;
  windows: AutomationWorkspaceWindow[];
  activeWindowId: string;
  activePaneId: string;
  activeViewId: string;
  maximizedWindowId: string | null;
  sidebarWidth: number;
  leftSidebarCollapsed: boolean;
  inspectorWidth: number;
  bottomTimelineHeight: number;
  bottomTimelineCollapsed: boolean;
  mainLayoutPreset: AutomationStrictMainLayoutPreset;
  mainSplitRatios: number[];
  panes: AutomationWorkspacePane[];
  rightSidebar: AutomationRightSidebarPrefs;
  bottomDock: AutomationBottomDockPrefs;
  utilityWindowsMigrated: boolean;
  rightSidebarCollapsed: boolean;
  viewStates: Record<string, Record<string, unknown>>;
  density: AutomationWorkspaceDensity;
  motion: AutomationWorkspaceMotion;
};

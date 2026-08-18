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
  layoutVersion: 2;
  windows: AutomationWorkspaceWindow[];
  activeWindowId: string;
  activePaneId: string;
  activeViewId: string;
  maximizedWindowId: string | null;
  sidebarWidth: number;
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
};

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

const bottomDockViewIds = new Set(["recording-action-preview"]);
const rightSidebarViewIds = new Set(["global-inspector", "workspace-dock", "ai-assistant", "problems-view"]);
export const automationBottomDockMinHeight = 165;
export const automationBottomDockDefaultHeight = 220;
export const automationBottomDockMaxHeight = 420;

export function automationWorkspaceRegionForView(viewId: string): AutomationWorkspaceRegion {
  if (bottomDockViewIds.has(viewId)) return "bottom";
  if (rightSidebarViewIds.has(viewId)) return "right";
  return "main";
}

export function automationMainPaneCount(preset: AutomationStrictMainLayoutPreset): number {
  if (preset === "single") return 1;
  if (preset === "three-even" || preset === "three-main-two") return 3;
  return 2;
}

export function defaultAutomationMainSplitRatios(preset: AutomationStrictMainLayoutPreset): number[] {
  if (preset === "two-main-side") return [0.67, 0.33];
  if (preset === "three-even") return [1 / 3, 1 / 3, 1 / 3];
  if (preset === "three-main-two") return [0.5, 0.25, 0.25];
  if (preset === "two-rows") return [0.5, 0.5];
  if (preset === "two-even") return [0.5, 0.5];
  return [1];
}

export function normalizeAutomationMainSplitRatios(value: unknown, preset: AutomationStrictMainLayoutPreset): number[] {
  const count = automationMainPaneCount(preset);
  const fallback = defaultAutomationMainSplitRatios(preset);
  if (!Array.isArray(value)) return fallback;
  const raw = value.slice(0, count).map((item) => Number(item)).filter((item) => Number.isFinite(item) && item > 0.05);
  if (raw.length !== count) return fallback;
  const total = raw.reduce((sum, item) => sum + item, 0);
  if (total <= 0) return fallback;
  return raw.map((item) => item / total);
}

export function defaultAutomationWorkspacePanes(): AutomationWorkspacePane[] {
  return [{ id: "pane-main-1", activeViewId: "policy-primary", tabs: ["policy-primary"] }];
}

export function defaultAutomationRightSidebarPrefs(collapsed = false): AutomationRightSidebarPrefs {
  return { activeViewId: "global-inspector", tabs: ["global-inspector"], collapsed };
}

export function defaultAutomationBottomDockPrefs(expanded = false): AutomationBottomDockPrefs {
  return { activeViewId: "recording-action-preview", expanded };
}

export function defaultAutomationWorkspaceWindows(): AutomationWorkspaceWindow[] {
  return [
    { id: "window-policy", activeViewId: "policy-primary", tabs: ["policy-primary"], area: "main", xPct: 0, yPct: 0, widthPct: 100, heightPct: 100, zIndex: 1 },
    { id: "window-inspector", activeViewId: "global-inspector", tabs: ["global-inspector"], area: "right", xPct: 0, yPct: 0, widthPct: 100, heightPct: 100, zIndex: 2 }
  ];
}

export function defaultAutomationWorkspacePrefs(): AutomationWorkspacePrefs {
  return {
    layoutVersion: 2,
    windows: defaultAutomationWorkspaceWindows(),
    activeWindowId: "window-policy",
    activePaneId: "pane-main-1",
    activeViewId: "policy-primary",
    maximizedWindowId: null,
    sidebarWidth: 280,
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
    viewStates: {}
  };
}

export function normalizeAutomationWorkspacePrefs(value: AutomationWorkspacePrefs): AutomationWorkspacePrefs {
  const fallback = defaultAutomationWorkspacePrefs();
  const sourceValue = value as AutomationWorkspacePrefs & Partial<Record<keyof AutomationWorkspacePrefs, unknown>>;
  const legacyColumnWidths = (value as AutomationWorkspacePrefs & { columnWidths?: number[] }).columnWidths;
  const sourceWindows = Array.isArray(value.windows) ? value.windows : fallback.windows;
  const normalizedWindows = sourceWindows
    .filter((item) => item.tabs?.length && item.activeViewId)
    .map((item, index) => {
      const tabs = item.tabs.map((tab) => tab === "node-detail" ? "global-inspector" : tab === "pipeline-workbench" ? "proposal-workbench" : tab).filter((tab, tabIndex, allTabs) => allTabs.indexOf(tab) === tabIndex);
      const activeViewId = item.activeViewId === "node-detail" ? "global-inspector" : item.activeViewId === "pipeline-workbench" ? "proposal-workbench" : item.activeViewId;
      const legacyWindow = item as AutomationWorkspaceWindow & { area?: string; x?: number; y?: number; widthPx?: number; heightPx?: number; widthWeight?: number };
      const legacyArea = String(legacyWindow.area ?? "main");
      const area: AutomationWorkspaceArea = legacyArea === "right" ? "right" : "main";
      const fallbackWidth = area === "right" ? 320 : 1040;
      const fallbackHeight = area === "right" ? 520 : 640;
      const fallbackCanvasWidth = area === "right" ? 420 : 1120;
      const fallbackCanvasHeight = area === "right" ? 680 : 680;
      const legacyWidth = legacyWindow.widthPx ?? (legacyWindow.widthWeight ? Number(legacyWindow.widthWeight) * 8 : legacyColumnWidths?.[index]);
      const migratedGeometry = legacyWidth || legacyWindow.heightPx || legacyWindow.x || legacyWindow.y
        ? automationPixelsToRelativeGeometry({
          x: area === "main" && legacyArea === "bottom" ? 24 + index * 28 : clampNumber(legacyWindow.x, 0, 6000, 10 + index * 32),
          y: area === "main" && legacyArea === "bottom" ? 360 + index * 28 : clampNumber(legacyWindow.y, 0, 6000, 10 + index * 32),
          widthPx: clampNumber(legacyWidth, 240, 1800, fallbackWidth),
          heightPx: clampNumber(legacyWindow.heightPx, 210, 1400, fallbackHeight)
        }, fallbackCanvasWidth, fallbackCanvasHeight)
        : null;
      return {
        ...item,
        activeViewId,
        tabs: tabs.length ? tabs : [activeViewId],
        area,
        xPct: clampNumber(item.xPct ?? migratedGeometry?.xPct, 0, 100, 0),
        yPct: clampNumber(item.yPct ?? migratedGeometry?.yPct, 0, 100, 0),
        widthPct: clampNumber(item.widthPct ?? migratedGeometry?.widthPct, 1, 100, 100),
        heightPct: clampNumber(item.heightPct ?? migratedGeometry?.heightPct, 1, 100, 100),
        zIndex: clampNumber(item.zIndex, 1, 9999, index + 1)
      };
    });
  const utilityWindowsMigrated = Boolean(value.utilityWindowsMigrated);
  const hasInspectorWindow = normalizedWindows.some((item) => item.tabs.includes("global-inspector") || item.activeViewId === "global-inspector");
  const utilityMigrationWindows = !utilityWindowsMigrated
    ? defaultAutomationWorkspaceWindows().filter((item) => item.activeViewId === "global-inspector" && !hasInspectorWindow)
    : [];
  const windows = utilityMigrationWindows.length
    ? [
      ...normalizedWindows,
      ...utilityMigrationWindows.map((item, index) => ({ ...item, zIndex: nextAutomationZIndex(normalizedWindows) + index }))
    ]
    : normalizedWindows;
  const rightSidebarCollapsed = Boolean(value.rightSidebarCollapsed ?? value.rightSidebar?.collapsed);
  const mainLayoutPreset = normalizeAutomationStrictMainLayoutPreset(sourceValue.mainLayoutPreset, windows);
  const panes = normalizeAutomationWorkspacePanes(sourceValue.panes, windows, value.activeWindowId, mainLayoutPreset);
  const activePaneId = panes.some((item) => item.id === value.activePaneId)
    ? value.activePaneId
    : panes.find((item) => item.tabs.includes(String(value.activeViewId ?? "")))?.id ?? panes[0]?.id ?? "";
  const activePane = panes.find((item) => item.id === activePaneId) ?? panes[0];
  const activeViewId = activePane?.activeViewId ?? fallback.activeViewId;
  const rightSidebar = normalizeAutomationRightSidebarPrefs(sourceValue.rightSidebar, windows, rightSidebarCollapsed);
  const bottomDock = normalizeAutomationBottomDockPrefs(sourceValue.bottomDock, windows);
  return {
    ...fallback,
    ...value,
    layoutVersion: 2,
    windows,
    activeWindowId: windows.some((item) => item.id === value.activeWindowId) ? value.activeWindowId : windows[0]?.id ?? "",
    activePaneId,
    activeViewId,
    maximizedWindowId: value.maximizedWindowId && windows.some((item) => item.id === value.maximizedWindowId) ? value.maximizedWindowId : null,
    sidebarWidth: clampNumber(value.sidebarWidth, 220, 420, fallback.sidebarWidth),
    inspectorWidth: clampNumber(value.inspectorWidth, 260, 620, fallback.inspectorWidth),
    bottomTimelineHeight: clampNumber(value.bottomTimelineHeight, automationBottomDockMinHeight, automationBottomDockMaxHeight, fallback.bottomTimelineHeight),
    bottomTimelineCollapsed: Boolean(value.bottomTimelineCollapsed ?? !bottomDock.expanded),
    mainLayoutPreset,
    mainSplitRatios: normalizeAutomationMainSplitRatios(sourceValue.mainSplitRatios, mainLayoutPreset),
    panes,
    rightSidebar,
    bottomDock,
    utilityWindowsMigrated: true,
    rightSidebarCollapsed,
    viewStates: value.viewStates && typeof value.viewStates === "object" && !Array.isArray(value.viewStates) ? value.viewStates : {}
  };
}

function normalizeAutomationStrictMainLayoutPreset(value: unknown, windows: AutomationWorkspaceWindow[]): AutomationStrictMainLayoutPreset {
  if (value === "single" || value === "two-even" || value === "two-main-side" || value === "three-even" || value === "three-main-two" || value === "two-rows") return value;
  const mainWindowCount = windows.filter((item) => (item.area ?? "main") === "main" && item.tabs.some((tab) => automationWorkspaceRegionForView(tab) === "main")).length;
  if (mainWindowCount >= 3) return "three-main-two";
  if (mainWindowCount === 2) return "two-main-side";
  return "single";
}

function normalizeAutomationWorkspacePanes(
  candidatePanes: unknown,
  windows: AutomationWorkspaceWindow[],
  activeWindowId: string,
  preset: AutomationStrictMainLayoutPreset
): AutomationWorkspacePane[] {
  const fromPanes = Array.isArray(candidatePanes)
    ? candidatePanes.map((item, index) => normalizePaneCandidate(item, index)).filter((item): item is AutomationWorkspacePane => Boolean(item))
    : [];
  const sourcePanes = fromPanes.length ? fromPanes : windows
    .filter((item) => (item.area ?? "main") === "main")
    .sort((left, right) => {
      if (left.id === activeWindowId) return -1;
      if (right.id === activeWindowId) return 1;
      return (left.zIndex ?? 0) - (right.zIndex ?? 0) || left.id.localeCompare(right.id);
    })
    .map((item, index) => {
      const tabs = uniqueMainTabs(item.tabs);
      const activeViewId = tabs.includes(item.activeViewId) ? item.activeViewId : tabs[0] ?? "";
      return tabs.length ? { id: `pane-main-${index + 1}`, activeViewId, tabs } : null;
    })
    .filter((item): item is AutomationWorkspacePane => Boolean(item));
  const sanitized = sourcePanes
    .map((item, index) => {
      const tabs = uniqueMainTabs(item.tabs);
      if (!tabs.length) return null;
      return {
        id: item.id || `pane-main-${index + 1}`,
        activeViewId: tabs.includes(item.activeViewId) ? item.activeViewId : tabs[0]!,
        tabs
      };
    })
    .filter((item): item is AutomationWorkspacePane => Boolean(item));
  const fallback = defaultAutomationWorkspacePanes();
  const count = automationMainPaneCount(preset);
  const base = sanitized.length ? sanitized : fallback;
  const panes = base.slice(0, count);
  const extras = base.slice(count).flatMap((item) => item.tabs);
  while (panes.length < count) {
    const fallbackPane = fallback[0]!;
    panes.push({ id: `pane-main-${panes.length + 1}`, activeViewId: fallbackPane.activeViewId, tabs: [...fallbackPane.tabs] });
  }
  if (extras.length && panes.length) {
    const last = panes[panes.length - 1]!;
    const tabs = [...last.tabs, ...extras.filter((tab) => !last.tabs.includes(tab))];
    panes[panes.length - 1] = { ...last, tabs, activeViewId: tabs.includes(last.activeViewId) ? last.activeViewId : tabs[0]! };
  }
  return panes.map((item, index) => ({ ...item, id: item.id || `pane-main-${index + 1}` }));
}

function normalizePaneCandidate(item: unknown, index: number): AutomationWorkspacePane | null {
  if (!item || typeof item !== "object") return null;
  const source = item as Partial<AutomationWorkspacePane>;
  const tabs = uniqueMainTabs(source.tabs ?? []);
  if (!tabs.length) return null;
  return {
    id: String(source.id ?? `pane-main-${index + 1}`),
    activeViewId: tabs.includes(String(source.activeViewId ?? "")) ? String(source.activeViewId) : tabs[0]!,
    tabs
  };
}

function uniqueMainTabs(tabs: unknown): string[] {
  if (!Array.isArray(tabs)) return [];
  return tabs
    .map((tab) => String(tab))
    .filter((tab) => tab && automationWorkspaceRegionForView(tab) === "main")
    .filter((tab, index, allTabs) => allTabs.indexOf(tab) === index);
}

function normalizeAutomationRightSidebarPrefs(value: unknown, windows: AutomationWorkspaceWindow[], collapsed: boolean): AutomationRightSidebarPrefs {
  const source = value && typeof value === "object" ? value as Partial<AutomationRightSidebarPrefs> : {};
  const fromWindows = windows.flatMap((item) => item.tabs).filter((tab) => automationWorkspaceRegionForView(tab) === "right");
  const tabs = [
    ...(Array.isArray(source.tabs) ? source.tabs.map((tab) => String(tab)) : []),
    ...fromWindows,
    "global-inspector"
  ].filter((tab, index, allTabs) => automationWorkspaceRegionForView(tab) === "right" && allTabs.indexOf(tab) === index);
  return {
    activeViewId: tabs.includes(String(source.activeViewId ?? "")) ? String(source.activeViewId) : "global-inspector",
    tabs,
    collapsed
  };
}

function normalizeAutomationBottomDockPrefs(value: unknown, windows: AutomationWorkspaceWindow[]): AutomationBottomDockPrefs {
  const source = value && typeof value === "object" ? value as Partial<AutomationBottomDockPrefs> : {};
  const hasTimeline = windows.some((item) => item.tabs.includes("timeline-recording") || item.activeViewId === "timeline-recording");
  return {
    activeViewId: "recording-action-preview",
    expanded: Boolean(source.expanded ?? hasTimeline)
  };
}

export function nextAutomationZIndex(windows: AutomationWorkspaceWindow[]): number {
  return Math.max(0, ...windows.map((item) => item.zIndex ?? 0)) + 1;
}

export function automationWindowGeometrySignature(windows: AutomationWorkspaceWindow[]): string {
  return windows.map((item) => `${item.id}:${item.area}:${item.xPct},${item.yPct},${item.widthPct},${item.heightPct}`).join("|");
}

export function automationWindowFillsCanvas(windowItem: AutomationWindowPixelGeometry, canvasWidth: number, canvasHeight: number): boolean {
  return windowItem.x <= 2
    && windowItem.y <= 2
    && Math.abs(windowItem.widthPx - canvasWidth) <= 3
    && Math.abs(windowItem.heightPx - canvasHeight) <= 3;
}

export function restoreAutomationWindowFromFullscreen(
  windowItem: AutomationWorkspaceWindowPixels,
  pointerX: number,
  pointerY: number,
  canvasWidth: number,
  canvasHeight: number
): AutomationWindowPixelGeometry {
  const widthPx = Math.min(Math.max(360, Math.round(canvasWidth * 0.62)), Math.min(860, canvasWidth));
  const heightPx = Math.min(Math.max(260, Math.round(canvasHeight * 0.62)), Math.min(560, canvasHeight));
  const ratioX = clampNumber(pointerX / Math.max(1, canvasWidth), 0.15, 0.85, 0.5);
  const x = pointerX - widthPx * ratioX;
  const y = Math.max(0, pointerY - 24);
  return clampAutomationWindowPixelGeometry({ x, y, widthPx, heightPx }, canvasWidth, canvasHeight, 240, 210);
}

export function clampAutomationWindowPixelGeometry(
  windowItem: AutomationWindowPixelGeometry,
  maxWidth: number,
  maxHeight: number,
  minWidth = 360,
  minHeight = 320
): AutomationWindowPixelGeometry {
  const effectiveMinWidth = Math.min(minWidth, maxWidth);
  const effectiveMinHeight = Math.min(minHeight, maxHeight);
  const widthPx = clampNumber(windowItem.widthPx, effectiveMinWidth, maxWidth, Math.min(1040, maxWidth));
  const heightPx = clampNumber(windowItem.heightPx, effectiveMinHeight, maxHeight, Math.min(640, maxHeight));
  return {
    widthPx,
    heightPx,
    x: clampNumber(windowItem.x, 0, Math.max(0, maxWidth - widthPx), 0),
    y: clampNumber(windowItem.y, 0, Math.max(0, maxHeight - heightPx), 0)
  };
}

export function automationWindowToPixels(
  windowItem: AutomationWorkspaceWindow,
  canvasWidth: number,
  canvasHeight: number,
  minWidth = 240,
  minHeight = 210
): AutomationWorkspaceWindowPixels {
  const geometry = clampAutomationWindowPixelGeometry({
    x: (clampNumber(windowItem.xPct, 0, 100, 0) / 100) * canvasWidth,
    y: (clampNumber(windowItem.yPct, 0, 100, 0) / 100) * canvasHeight,
    widthPx: (clampNumber(windowItem.widthPct, 1, 100, 100) / 100) * canvasWidth,
    heightPx: (clampNumber(windowItem.heightPct, 1, 100, 100) / 100) * canvasHeight
  }, canvasWidth, canvasHeight, minWidth, minHeight);
  return { ...windowItem, ...geometry };
}

export function automationPixelsToRelativeGeometry(
  geometry: AutomationWindowPixelGeometry,
  canvasWidth: number,
  canvasHeight: number
): AutomationWindowRelativeGeometry {
  const width = Math.max(1, canvasWidth);
  const height = Math.max(1, canvasHeight);
  const clamped = clampAutomationWindowPixelGeometry(geometry, width, height, 1, 1);
  return {
    xPct: roundAutomationPercent((clamped.x / width) * 100),
    yPct: roundAutomationPercent((clamped.y / height) * 100),
    widthPct: roundAutomationPercent((clamped.widthPx / width) * 100),
    heightPct: roundAutomationPercent((clamped.heightPx / height) * 100)
  };
}

export function roundAutomationPercent(value: number): number {
  return Math.round(value * 1000) / 1000;
}

export function layoutAutomationWindowsInPreset(
  windows: AutomationWorkspaceWindow[],
  preset: AutomationLayoutPresetOption,
  canvasWidth: number,
  canvasHeight: number
): AutomationWorkspaceWindow[] {
  const assignments = new Map<number, AutomationWorkspaceWindow[]>();
  windows.forEach((windowItem, index) => {
    const cellIndex = preset.id === "main-sidebar" && index > 0 ? 1 : index % preset.cells.length;
    const bucket = assignments.get(cellIndex) ?? [];
    bucket.push(windowItem);
    assignments.set(cellIndex, bucket);
  });

  return windows.map((windowItem, index) => {
    const cellIndex = preset.id === "main-sidebar" && index > 0 ? 1 : index % preset.cells.length;
    const cell = preset.cells[cellIndex] ?? preset.cells[0]!;
    const bucket = assignments.get(cellIndex) ?? [windowItem];
    const bucketIndex = bucket.findIndex((item) => item.id === windowItem.id);
    const splitCount = Math.max(1, bucket.length);
    const cellWidth = Math.max(240, Math.round(cell.w * canvasWidth));
    const cellHeight = Math.max(210, Math.floor((cell.h * canvasHeight) / splitCount));
    const geometry = automationPixelsToRelativeGeometry(clampAutomationWindowPixelGeometry({
      x: Math.round(cell.x * canvasWidth),
      y: Math.round(cell.y * canvasHeight) + bucketIndex * cellHeight,
      widthPx: cellWidth,
      heightPx: cellHeight
    }, canvasWidth, canvasHeight, Math.min(360, cellWidth), Math.min(320, cellHeight)), canvasWidth, canvasHeight);
    return {
      ...windowItem,
      ...geometry,
      zIndex: index + 1
    };
  });
}

export function findAutomationSharedResizePartners(
  windowItem: AutomationWorkspaceWindowPixels,
  edge: AutomationWindowResizeEdge,
  windows: AutomationWorkspaceWindowPixels[]
): AutomationSharedResizePartner[] {
  const threshold = 14;
  const partners = new Map<string, AutomationSharedResizePartner>();
  const left = windowItem.x;
  const right = windowItem.x + windowItem.widthPx;
  const top = windowItem.y;
  const bottom = windowItem.y + windowItem.heightPx;
  for (const item of windows) {
    if (item.id === windowItem.id) continue;
    const itemRight = item.x + item.widthPx;
    const itemBottom = item.y + item.heightPx;
    if (edge.includes("east") && Math.abs(item.x - right) <= threshold && automationRangesOverlap(top, bottom, item.y, itemBottom)) {
      partners.set(`${item.id}:west`, { id: item.id, side: "west", start: item });
    }
    if (edge.includes("west") && Math.abs(itemRight - left) <= threshold && automationRangesOverlap(top, bottom, item.y, itemBottom)) {
      partners.set(`${item.id}:east`, { id: item.id, side: "east", start: item });
    }
    if (edge.includes("south") && Math.abs(item.y - bottom) <= threshold && automationRangesOverlap(left, right, item.x, itemRight)) {
      partners.set(`${item.id}:north`, { id: item.id, side: "north", start: item });
    }
    if (edge.includes("north") && Math.abs(itemBottom - top) <= threshold && automationRangesOverlap(left, right, item.x, itemRight)) {
      partners.set(`${item.id}:south`, { id: item.id, side: "south", start: item });
    }
  }
  return [...partners.values()];
}

export function constrainAutomationResizeDelta(
  value: number,
  axis: "x" | "y",
  edge: AutomationWindowResizeEdge,
  windowItem: AutomationWindowPixelGeometry,
  partners: AutomationSharedResizePartner[],
  canvasSize: number
): number {
  const minSize = axis === "x" ? 240 : 210;
  const startPosition = axis === "x" ? windowItem.x : windowItem.y;
  const startSize = axis === "x" ? windowItem.widthPx : windowItem.heightPx;
  let minDelta = Number.NEGATIVE_INFINITY;
  let maxDelta = Number.POSITIVE_INFINITY;

  if ((axis === "x" && edge.includes("east")) || (axis === "y" && edge.includes("south"))) {
    minDelta = Math.max(minDelta, minSize - startSize);
    maxDelta = Math.min(maxDelta, canvasSize - (startPosition + startSize));
  }
  if ((axis === "x" && edge.includes("west")) || (axis === "y" && edge.includes("north"))) {
    minDelta = Math.max(minDelta, -startPosition);
    maxDelta = Math.min(maxDelta, startSize - minSize);
  }

  for (const partner of partners) {
    const partnerStart = axis === "x" ? partner.start.x : partner.start.y;
    const partnerSize = axis === "x" ? partner.start.widthPx : partner.start.heightPx;
    if ((axis === "x" && partner.side === "west") || (axis === "y" && partner.side === "north")) {
      minDelta = Math.max(minDelta, -partnerStart);
      maxDelta = Math.min(maxDelta, partnerSize - minSize);
    }
    if ((axis === "x" && partner.side === "east") || (axis === "y" && partner.side === "south")) {
      minDelta = Math.max(minDelta, minSize - partnerSize);
      maxDelta = Math.min(maxDelta, canvasSize - (partnerStart + partnerSize));
    }
  }

  if (!Number.isFinite(minDelta)) minDelta = value;
  if (!Number.isFinite(maxDelta)) maxDelta = value;
  return Math.min(maxDelta, Math.max(minDelta, value));
}

export function automationRangesOverlap(startA: number, endA: number, startB: number, endB: number): boolean {
  return Math.min(endA, endB) - Math.max(startA, startB) > 24;
}

export function fullAutomationWindowGeometry(): AutomationWindowRelativeGeometry {
  return { xPct: 0, yPct: 0, widthPct: 100, heightPct: 100 };
}

export function placeAutomationWindow(windows: AutomationWorkspaceWindow[], bounds: DOMRect | undefined): AutomationWindowRelativeGeometry {
  const canvasWidth = Math.max(1, Math.floor(bounds?.width ?? 1120));
  const canvasHeight = Math.max(1, Math.floor(bounds?.height ?? 680));
  const gap = 8;
  const pixelWindows = windows.map((item) => automationWindowToPixels(item, canvasWidth, canvasHeight));
  const active = pixelWindows.reduce<AutomationWorkspaceWindowPixels | null>((latest, item) => !latest || item.zIndex > latest.zIndex ? item : latest, null);
  if (active) {
    const rightX = active.x + active.widthPx + gap;
    const rightSpace = canvasWidth - rightX;
    if (rightSpace >= 420) return automationPixelsToRelativeGeometry({ x: rightX, y: active.y, widthPx: rightSpace, heightPx: Math.min(active.heightPx, canvasHeight - active.y) }, canvasWidth, canvasHeight);
    const belowY = active.y + active.heightPx + gap;
    const belowSpace = canvasHeight - belowY;
    if (belowSpace >= 340) return automationPixelsToRelativeGeometry({ x: active.x, y: belowY, widthPx: Math.min(active.widthPx, canvasWidth - active.x), heightPx: belowSpace }, canvasWidth, canvasHeight);
  }
  const offset = windows.length * 34;
  return automationPixelsToRelativeGeometry(clampAutomationWindowPixelGeometry({
    x: offset,
    y: offset,
    widthPx: Math.min(1040, canvasWidth),
    heightPx: Math.min(640, canvasHeight)
  }, canvasWidth, canvasHeight), canvasWidth, canvasHeight);
}

export function automationSnapGeometry(canvasElement: HTMLDivElement | null, clientX: number, clientY: number): AutomationWindowPixelGeometry | null {
  if (!canvasElement) return null;
  const bounds = canvasElement.getBoundingClientRect();
  const threshold = 64;
  if (clientX < bounds.left || clientX > bounds.right || clientY < bounds.top || clientY > bounds.bottom) return null;
  const width = Math.max(1, bounds.width);
  const height = Math.max(1, bounds.height);
  const left = clientX - bounds.left <= threshold;
  const right = bounds.right - clientX <= threshold;
  const top = clientY - bounds.top <= threshold;
  const bottom = bounds.bottom - clientY <= threshold;
  if ((left || right) && (top || bottom)) return { x: 0, y: 0, widthPx: width, heightPx: height };
  if (left) return { x: 0, y: 0, widthPx: Math.floor(width / 2), heightPx: height };
  if (right) return { x: Math.floor(width / 2), y: 0, widthPx: Math.ceil(width / 2), heightPx: height };
  if (top) return { x: 0, y: 0, widthPx: width, heightPx: Math.floor(height / 2) };
  if (bottom) return { x: 0, y: Math.floor(height / 2), widthPx: width, heightPx: Math.ceil(height / 2) };
  return null;
}

export function clampNumber(value: unknown, min: number, max: number, fallback: number): number {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.min(max, Math.max(min, numeric));
}


import { automationStudioViewId, type AutomationStudioViewMigrationContext } from "../../views/view-registry";
import type { AutomationWorkspaceArea, AutomationWorkspacePrefs, AutomationWorkspaceWindow } from "./contracts";
import { automationBottomDockMaxHeight, automationBottomDockMinHeight, defaultAutomationWorkspacePrefs, defaultAutomationWorkspaceWindows } from "./defaults";
import { normalizeAutomationMainSplitRatios } from "./mutations";
import { canonicalAutomationWorkspaceViewId, normalizeAutomationBottomDockPrefs, normalizeAutomationRightSidebarPrefs, normalizeAutomationStrictMainLayoutPreset, normalizeAutomationWorkspacePanes } from "./normalization";
import { automationPixelsToRelativeGeometry, clampNumber, nextAutomationZIndex } from "./sizing";

export function normalizeAutomationWorkspacePrefs(
  value: AutomationWorkspacePrefs,
  context: AutomationStudioViewMigrationContext = { hasFlow: false }
): AutomationWorkspacePrefs {
  const fallback = defaultAutomationWorkspacePrefs();
  const sourceValue = value as AutomationWorkspacePrefs & Partial<Record<keyof AutomationWorkspacePrefs, unknown>>;
  const legacyColumnWidths = (value as AutomationWorkspacePrefs & { columnWidths?: number[] }).columnWidths;
  const sourceWindows = Array.isArray(value.windows) ? value.windows : fallback.windows;
  const normalizedWindows = sourceWindows
    .filter((item) => item.tabs?.length && item.activeViewId)
    .map((item, index) => {
      const tabs = item.tabs.map((tab) => canonicalAutomationWorkspaceViewId(tab, context)).filter((tab, tabIndex, allTabs) => allTabs.indexOf(tab) === tabIndex);
      const activeViewId = canonicalAutomationWorkspaceViewId(item.activeViewId, context);
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
  const hasInspectorWindow = normalizedWindows.some((item) => item.tabs.includes(automationStudioViewId.inspector) || item.activeViewId === automationStudioViewId.inspector);
  const utilityMigrationWindows = !utilityWindowsMigrated
    ? defaultAutomationWorkspaceWindows().filter((item) => item.activeViewId === automationStudioViewId.inspector && !hasInspectorWindow)
    : [];
  const windows = utilityMigrationWindows.length
    ? [
      ...normalizedWindows,
      ...utilityMigrationWindows.map((item, index) => ({ ...item, zIndex: nextAutomationZIndex(normalizedWindows) + index }))
    ]
    : normalizedWindows;
  const rightSidebarCollapsed = Boolean(value.rightSidebarCollapsed ?? value.rightSidebar?.collapsed);
  const mainLayoutPreset = normalizeAutomationStrictMainLayoutPreset(sourceValue.mainLayoutPreset, windows);
  const panes = normalizeAutomationWorkspacePanes(sourceValue.panes, windows, value.activeWindowId, mainLayoutPreset, context);
  const activePaneId = panes.some((item) => item.id === value.activePaneId)
    ? value.activePaneId
    : panes.find((item) => item.tabs.includes(String(value.activeViewId ?? "")))?.id ?? panes[0]?.id ?? "";
  const activePane = panes.find((item) => item.id === activePaneId) ?? panes[0];
  const activeViewId = activePane?.activeViewId ?? fallback.activeViewId;
  const rightSidebar = normalizeAutomationRightSidebarPrefs(sourceValue.rightSidebar, windows, rightSidebarCollapsed, context);
  const bottomDock = normalizeAutomationBottomDockPrefs(sourceValue.bottomDock, windows);
  const sourceViewStates = value.viewStates && typeof value.viewStates === "object" && !Array.isArray(value.viewStates) ? value.viewStates : {};
  const viewStates = Object.entries(sourceViewStates).reduce<Record<string, Record<string, unknown>>>((result, [viewId, state]) => {
    const canonicalId = canonicalAutomationWorkspaceViewId(viewId, context);
    if (canonicalId !== viewId && Object.prototype.hasOwnProperty.call(sourceViewStates, canonicalId)) return result;
    result[canonicalId] = state;
    return result;
  }, {});
  return {
    ...fallback,
    ...value,
    layoutVersion: 4,
    windows: [],
    activeWindowId: "",
    activePaneId,
    activeViewId,
    maximizedWindowId: null,
    sidebarWidth: clampNumber(value.sidebarWidth, 220, 420, fallback.sidebarWidth),
    leftSidebarCollapsed: Boolean(value.leftSidebarCollapsed),
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
    viewStates,
    density: sourceValue.density === "compact" ? "compact" : "comfortable",
    motion: sourceValue.motion === "reduce" ? "reduce" : "system"
  };
}

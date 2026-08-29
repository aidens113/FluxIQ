import {
  automationStudioViewId,
  canonicalAutomationStudioViewId,
  type AutomationStudioViewMigrationContext
} from "../../views/view-registry";
import type {
  AutomationBottomDockPrefs,
  AutomationRightSidebarPrefs,
  AutomationStrictMainLayoutPreset,
  AutomationWorkspacePane,
  AutomationWorkspaceWindow
} from "./contracts";
import { defaultAutomationWorkspacePanes } from "./defaults";
import { automationMainPaneCount } from "./mutations";
import { automationWorkspaceRegionForView } from "./regions";

export function canonicalAutomationWorkspaceViewId(
  viewId: string,
  context: AutomationStudioViewMigrationContext = { hasFlow: false }
): string {
  return canonicalAutomationStudioViewId(viewId, context);
}

export function normalizeAutomationStrictMainLayoutPreset(
  value: unknown,
  windows: AutomationWorkspaceWindow[]
): AutomationStrictMainLayoutPreset {
  if (value === "single" || value === "two-even" || value === "two-main-side" || value === "three-even" || value === "three-main-two" || value === "two-rows") return value;
  const mainWindowCount = windows.filter((item) => (item.area ?? "main") === "main" && item.tabs.some((tab) => automationWorkspaceRegionForView(tab) === "main")).length;
  if (mainWindowCount >= 3) return "three-main-two";
  if (mainWindowCount === 2) return "two-main-side";
  return "single";
}

export function normalizeAutomationWorkspacePanes(
  candidatePanes: unknown,
  windows: AutomationWorkspaceWindow[],
  activeWindowId: string,
  preset: AutomationStrictMainLayoutPreset,
  context: AutomationStudioViewMigrationContext = { hasFlow: false }
): AutomationWorkspacePane[] {
  const fromPanes = Array.isArray(candidatePanes)
    ? candidatePanes.map((item, index) => normalizePaneCandidate(item, index, context)).filter((item): item is AutomationWorkspacePane => Boolean(item))
    : [];
  const mainWindows = windows
    .filter((item) => (item.area ?? "main") === "main")
    .sort((left, right) => {
      if (left.id === activeWindowId) return -1;
      if (right.id === activeWindowId) return 1;
      return (left.zIndex ?? 0) - (right.zIndex ?? 0) || left.id.localeCompare(right.id);
    });
  const sourcePanes = fromPanes.length ? fromPanes : mainWindows
    .map((item, index) => {
      const tabs = uniqueMainTabs(item.tabs, context);
      const requestedActiveViewId = canonicalAutomationWorkspaceViewId(item.activeViewId, context);
      const activeViewId = tabs.includes(requestedActiveViewId) ? requestedActiveViewId : tabs[0] ?? "";
      return tabs.length ? { id: `pane-main-${index + 1}`, activeViewId, tabs } : null;
    })
    .filter((item): item is AutomationWorkspacePane => Boolean(item));
  const sanitized = sourcePanes
    .map((item, index) => {
      const tabs = uniqueMainTabs(item.tabs, context);
      if (!tabs.length) return null;
      const requestedActiveViewId = canonicalAutomationWorkspaceViewId(item.activeViewId, context);
      return {
        id: item.id || `pane-main-${index + 1}`,
        activeViewId: tabs.includes(requestedActiveViewId) ? requestedActiveViewId : tabs[0]!,
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
    const fallbackPane = { id: "pane-main-1", activeViewId: automationStudioViewId.flowEditor, tabs: [automationStudioViewId.flowEditor] };
    panes.push({ id: `pane-main-${panes.length + 1}`, activeViewId: fallbackPane.activeViewId, tabs: [...fallbackPane.tabs] });
  }
  if (extras.length && panes.length) {
    const last = panes[panes.length - 1]!;
    const tabs = [...last.tabs, ...extras.filter((tab) => !last.tabs.includes(tab))];
    panes[panes.length - 1] = { ...last, tabs, activeViewId: tabs.includes(last.activeViewId) ? last.activeViewId : tabs[0]! };
  }
  return panes.map((item, index) => ({ ...item, id: item.id || `pane-main-${index + 1}` }));
}

function normalizePaneCandidate(
  item: unknown,
  index: number,
  context: AutomationStudioViewMigrationContext
): AutomationWorkspacePane | null {
  if (!item || typeof item !== "object") return null;
  const source = item as Partial<AutomationWorkspacePane>;
  const tabs = uniqueMainTabs(source.tabs ?? [], context);
  if (!tabs.length) return null;
  const requestedActiveViewId = canonicalAutomationWorkspaceViewId(String(source.activeViewId ?? ""), context);
  return {
    id: String(source.id ?? `pane-main-${index + 1}`),
    activeViewId: tabs.includes(requestedActiveViewId) ? requestedActiveViewId : tabs[0]!,
    tabs
  };
}

function uniqueMainTabs(tabs: unknown, context: AutomationStudioViewMigrationContext): string[] {
  if (!Array.isArray(tabs)) return [];
  return tabs
    .map((tab) => canonicalAutomationWorkspaceViewId(String(tab), context))
    .filter((tab) => tab && automationWorkspaceRegionForView(tab) === "main")
    .filter((tab, index, allTabs) => allTabs.indexOf(tab) === index);
}

export function normalizeAutomationRightSidebarPrefs(
  value: unknown,
  windows: AutomationWorkspaceWindow[],
  collapsed: boolean,
  context: AutomationStudioViewMigrationContext = { hasFlow: false }
): AutomationRightSidebarPrefs {
  const source = value && typeof value === "object" ? value as Partial<AutomationRightSidebarPrefs> : {};
  const fromWindows = windows.flatMap((item) => item.tabs).filter((tab) => automationWorkspaceRegionForView(tab) === "right");
  const tabs = [
    ...(Array.isArray(source.tabs) ? source.tabs.map((tab) => canonicalAutomationWorkspaceViewId(String(tab), context)) : []),
    ...fromWindows,
    automationStudioViewId.inspector
  ].filter((tab, index, allTabs) => automationWorkspaceRegionForView(tab) === "right" && allTabs.indexOf(tab) === index);
  const requestedActiveViewId = canonicalAutomationWorkspaceViewId(String(source.activeViewId ?? ""), context);
  return {
    activeViewId: tabs.includes(requestedActiveViewId) ? requestedActiveViewId : automationStudioViewId.inspector,
    tabs,
    collapsed
  };
}

export function normalizeAutomationViewStates(
  value: unknown,
  context: AutomationStudioViewMigrationContext = { hasFlow: false }
): Record<string, Record<string, unknown>> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const source = value as Record<string, Record<string, unknown>>;
  const canonicalEntries = Object.entries(source)
    .filter(([viewId]) => canonicalAutomationWorkspaceViewId(viewId, context) === viewId);
  const legacyEntries = Object.entries(source)
    .filter(([viewId]) => canonicalAutomationWorkspaceViewId(viewId, context) !== viewId);
  return [...legacyEntries, ...canonicalEntries].reduce<Record<string, Record<string, unknown>>>(
    (states, [viewId, state]) => {
      states[canonicalAutomationWorkspaceViewId(viewId, context)] = state;
      return states;
    },
    {}
  );
}

export function normalizeAutomationBottomDockPrefs(
  value: unknown,
  windows: AutomationWorkspaceWindow[]
): AutomationBottomDockPrefs {
  const source = value && typeof value === "object" ? value as Partial<AutomationBottomDockPrefs> : {};
  const hasTimeline = windows.some((item) => item.tabs.includes(automationStudioViewId.recordingTimeline) || item.activeViewId === automationStudioViewId.recordingTimeline);
  return {
    activeViewId: "recording-action-preview",
    expanded: Boolean(source.expanded ?? hasTimeline)
  };
}

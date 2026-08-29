import type { AutomationStrictMainLayoutPreset, AutomationWorkspacePane, AutomationWorkspacePrefs } from "./contracts";
import { defaultAutomationWorkspacePanes } from "./defaults";
import { automationWorkspaceRegionForView } from "./regions";
import { clampNumber } from "./sizing";

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

export function resizeAutomationMainSplitRatios(ratios: number[], splitIndex: number, delta: number): number[] {
  const left = ratios[splitIndex];
  const right = ratios[splitIndex + 1];
  if (left === undefined || right === undefined) return ratios;
  const pairTotal = left + right;
  const minRatio = Math.min(0.24, Math.max(0.12, pairTotal * 0.22));
  const nextLeft = clampNumber(left + delta, minRatio, pairTotal - minRatio, left);
  return ratios.map((ratio, index) => {
    if (index === splitIndex) return nextLeft;
    if (index === splitIndex + 1) return pairTotal - nextLeft;
    return ratio;
  });
}

export function automationMainLayoutPresetForPaneCount(count: number, currentPreset: AutomationStrictMainLayoutPreset): AutomationStrictMainLayoutPreset {
  if (count <= 1) return "single";
  if (count === 2) return currentPreset === "two-rows" ? "two-rows" : "two-main-side";
  return currentPreset === "three-even" ? "three-even" : "three-main-two";
}

export function closeAutomationWorkspacePaneTab(
  panes: AutomationWorkspacePane[],
  paneId: string,
  viewId: string,
  activePaneId: string,
  currentPreset: AutomationStrictMainLayoutPreset
): Pick<AutomationWorkspacePrefs, "activePaneId" | "activeViewId" | "mainLayoutPreset" | "mainSplitRatios" | "panes"> {
  const fallback = defaultAutomationWorkspacePanes()[0]!;
  const nextPanes = panes
    .map((pane) => {
      if (pane.id !== paneId) return pane;
      const tabs = pane.tabs.filter((tab) => tab !== viewId);
      return { ...pane, tabs, activeViewId: pane.activeViewId === viewId ? tabs[0] ?? "" : pane.activeViewId };
    })
    .filter((pane) => pane.tabs.length > 0);
  const panesWithFallback = nextPanes.length ? nextPanes : [{ ...fallback, id: paneId || fallback.id }];
  const mainLayoutPreset = automationMainLayoutPresetForPaneCount(panesWithFallback.length, currentPreset);
  const activePane = panesWithFallback.find((pane) => pane.id === activePaneId) ?? panesWithFallback[0]!;
  return {
    activePaneId: activePane.id,
    activeViewId: activePane.activeViewId,
    mainLayoutPreset,
    mainSplitRatios: defaultAutomationMainSplitRatios(mainLayoutPreset),
    panes: panesWithFallback
  };
}

export function moveAutomationWorkspacePaneTab(
  panes: AutomationWorkspacePane[],
  sourcePaneId: string,
  targetPaneId: string,
  viewId: string,
  currentPreset: AutomationStrictMainLayoutPreset,
  targetViewId: string | null = null,
  placement: "before" | "after" | "end" = "end"
): Pick<AutomationWorkspacePrefs, "activePaneId" | "activeViewId" | "mainLayoutPreset" | "mainSplitRatios" | "panes"> | null {
  if (sourcePaneId === targetPaneId) {
    const targetPane = panes.find((pane) => pane.id === targetPaneId);
    if (!targetPane || !targetPane.tabs.includes(viewId)) return null;
    const tabs = insertAutomationPaneTab(targetPane.tabs.filter((tab) => tab !== viewId), viewId, targetViewId, placement);
    return {
      activePaneId: targetPane.id,
      activeViewId: viewId,
      mainLayoutPreset: currentPreset,
      mainSplitRatios: defaultAutomationMainSplitRatios(currentPreset),
      panes: panes.map((pane) => pane.id === targetPane.id ? { ...pane, tabs, activeViewId: viewId } : pane)
    };
  }
  const sourcePane = panes.find((pane) => pane.id === sourcePaneId);
  const targetPane = panes.find((pane) => pane.id === targetPaneId);
  if (!sourcePane || !targetPane || !sourcePane.tabs.includes(viewId) || automationWorkspaceRegionForView(viewId) !== "main") return null;
  const nextPanes = panes
    .map((pane) => {
      if (pane.id === sourcePaneId) {
        const tabs = pane.tabs.filter((tab) => tab !== viewId);
        return { ...pane, tabs, activeViewId: pane.activeViewId === viewId ? tabs[0] ?? "" : pane.activeViewId };
      }
      if (pane.id === targetPaneId) {
        const tabs = insertAutomationPaneTab(pane.tabs.filter((tab) => tab !== viewId), viewId, targetViewId, placement);
        return { ...pane, tabs, activeViewId: viewId };
      }
      return pane;
    })
    .filter((pane) => pane.tabs.length > 0);
  const mainLayoutPreset = automationMainLayoutPresetForPaneCount(nextPanes.length, currentPreset);
  return {
    activePaneId: targetPaneId,
    activeViewId: viewId,
    mainLayoutPreset,
    mainSplitRatios: defaultAutomationMainSplitRatios(mainLayoutPreset),
    panes: nextPanes
  };
}

function insertAutomationPaneTab(tabs: string[], viewId: string, targetViewId: string | null, placement: "before" | "after" | "end"): string[] {
  if (placement === "end" || !targetViewId) return [...tabs, viewId].filter((tab, index, allTabs) => allTabs.indexOf(tab) === index);
  const targetIndex = tabs.indexOf(targetViewId);
  if (targetIndex < 0) return [...tabs, viewId].filter((tab, index, allTabs) => allTabs.indexOf(tab) === index);
  const insertIndex = placement === "after" ? targetIndex + 1 : targetIndex;
  return [...tabs.slice(0, insertIndex), viewId, ...tabs.slice(insertIndex)].filter((tab, index, allTabs) => allTabs.indexOf(tab) === index);
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

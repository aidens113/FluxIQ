import type { AutomationWorkspacePane, AutomationWorkspacePrefs } from "../layout/contracts";
import { defaultAutomationRightSidebarPrefs, defaultAutomationWorkspacePanes } from "../layout/defaults";
import { automationStudioViewDefinitions } from "../../views/view-registry";
import {
  automationMainLayoutPresetForPaneCount,
  automationMainPaneCount,
  closeAutomationWorkspacePaneTab,
  defaultAutomationMainSplitRatios,
  moveAutomationWorkspacePaneTab
} from "../layout/mutations";
import { automationWorkspaceRegionForView } from "../layout/regions";
import type {
  AutomationWorkspaceCommandPort,
  AutomationWorkspaceCommands,
  AutomationWorkspaceRegionActivation,
  AutomationWorkspaceWarmActivator
} from "./contracts";
import { chooseAutomationMainPane, nextAutomationPaneId } from "./pane-choice";

export const automationWorkspaceMaxMainPanes = 3;

const defaultMainViewId = defaultAutomationWorkspacePanes()[0]!.activeViewId;
const uniqueMainPaneFallbacks = automationStudioViewDefinitions()
  .filter((definition) => definition.region === "main" && definition.id !== defaultMainViewId)
  .map((definition) => definition.id);

export function createAutomationWorkspaceCommands(options: {
  port: AutomationWorkspaceCommandPort;
  warm: AutomationWorkspaceWarmActivator;
  onRegionActivated?(activation: AutomationWorkspaceRegionActivation): void;
}): AutomationWorkspaceCommands {
  const { port, warm } = options;
  const defaultRightViewId = defaultAutomationRightSidebarPrefs().activeViewId;
  const perform = (operation: () => void) => port.schedule ? port.schedule(operation) : operation();
  const notifyRegion = (activation: AutomationWorkspaceRegionActivation) => {
    options.onRegionActivated?.(activation);
  };
  const commit = (update: (current: AutomationWorkspacePrefs) => AutomationWorkspacePrefs, persist = false) => {
    let changed = false;
    perform(() => {
      changed = port.commit(update, { persist, scope: "workspace" });
    });
    return changed || Boolean(port.schedule);
  };
  const activateMain = (paneId: string, viewId: string) => {
    const current = port.read();
    const pane = current.panes.find((candidate) => candidate.id === paneId);
    if (!pane) return false;
    notifyRegion({ region: "main", paneId, viewId });
    const unchanged = current.activePaneId === paneId
      && current.activeViewId === viewId
      && pane.activeViewId === viewId
      && pane.tabs.includes(viewId);
    if (unchanged) return false;
    warm.activate("main", paneId, viewId);
    return commit((current) => ({
      ...current,
      activePaneId: paneId,
      activeViewId: viewId,
      panes: current.panes.map((candidate) => candidate.id === paneId
        ? { ...candidate, activeViewId: viewId, tabs: uniqueTabs([...candidate.tabs, viewId]) }
        : candidate)
    }));
  };
  const activateRight = (viewId: string) => {
    notifyRegion({ region: "right", paneId: "right-sidebar", viewId });
    const current = port.read();
    const unchanged = !current.rightSidebarCollapsed
      && !current.rightSidebar.collapsed
      && current.rightSidebar.activeViewId === viewId
      && current.rightSidebar.tabs.includes(viewId);
    if (unchanged) return false;
    warm.activate("right", "right-sidebar", viewId);
    return commit((current) => ({
      ...current,
      rightSidebarCollapsed: false,
      rightSidebar: {
        ...current.rightSidebar,
        activeViewId: viewId,
        collapsed: false,
        tabs: uniqueTabs([...current.rightSidebar.tabs, viewId])
      }
    }));
  };

  const commands: AutomationWorkspaceCommands = {
    openView(viewId, mode = "preview") {
      const region = automationWorkspaceRegionForView(viewId);
      if (region === "bottom") {
        notifyRegion({ region, paneId: "bottom-dock", viewId });
        return commit((current) => ({
          ...current,
          bottomTimelineCollapsed: false,
          bottomDock: { ...current.bottomDock, activeViewId: current.bottomDock.activeViewId, expanded: true },
          maximizedWindowId: null
        }));
      }
      if (region === "right") return activateRight(viewId);
      const current = port.read();
      if (mode === "new-window" && !current.panes.some((pane) => pane.tabs.includes(viewId))) {
        if (current.panes.length >= automationWorkspaceMaxMainPanes) return false;
        const paneId = nextAutomationPaneId(current.panes);
        notifyRegion({ region: "main", paneId, viewId });
        return commit((latest) => latest.panes.length >= automationWorkspaceMaxMainPanes
          ? latest
          : addMainPane(latest, viewId, paneId), true);
      }
      const pane = chooseAutomationMainPane(current, viewId);
      return pane ? activateMain(pane.id, viewId) : false;
    },
    activatePane(paneId) {
      const pane = port.read().panes.find((candidate) => candidate.id === paneId);
      return pane ? activateMain(pane.id, pane.activeViewId) : false;
    },
    selectPaneTab: activateMain,
    addPaneTab: activateMain,
    closePaneTab(paneId, viewId) {
      if (!port.read().panes.some((pane) => pane.id === paneId && pane.tabs.includes(viewId))) return false;
      return commit((current) => ({
        ...current,
        ...closeAutomationWorkspacePaneTab(
          current.panes,
          paneId,
          viewId,
          current.activePaneId,
          current.mainLayoutPreset
        )
      }), true);
    },
    movePaneTab(sourcePaneId, targetPaneId, viewId, targetViewId = null, placement = "end") {
      if (sourcePaneId === targetPaneId && targetViewId === viewId) return false;
      return commit((current) => {
        const moved = moveAutomationWorkspacePaneTab(
          current.panes,
          sourcePaneId,
          targetPaneId,
          viewId,
          current.mainLayoutPreset,
          targetViewId,
          placement
        );
        return moved ? { ...current, ...moved } : current;
      }, true);
    },
    movePaneTabByKeyboard(paneId, viewId, direction) {
      const panes = port.read().panes;
      const sourceIndex = panes.findIndex((pane) => pane.id === paneId);
      const target = panes[sourceIndex + direction];
      return target ? commands.movePaneTab(paneId, target.id, viewId) : false;
    },
    selectRightTab: activateRight,
    addRightTab: activateRight,
    closeRightTab(viewId) {
      if (!port.read().rightSidebar.tabs.includes(viewId)) return false;
      return commit((current) => {
        const tabs = current.rightSidebar.tabs.filter((tab) => tab !== viewId);
        const nextTabs = tabs.length ? tabs : [defaultRightViewId];
        return {
          ...current,
          rightSidebar: {
            ...current.rightSidebar,
            tabs: nextTabs,
            activeViewId: current.rightSidebar.activeViewId === viewId
              ? nextTabs[0] ?? defaultRightViewId
              : current.rightSidebar.activeViewId
          }
        };
      }, true);
    },
    applyLayoutPreset(preset) {
      return commit((current) => resizeMainPanesForPreset(current, preset), true);
    },
    toggleRightSidebar() {
      return commit((current) => {
        const collapsed = !current.rightSidebarCollapsed;
        return {
          ...current,
          rightSidebarCollapsed: collapsed,
          rightSidebar: { ...current.rightSidebar, collapsed }
        };
      }, true);
    },
    toggleTimeline() {
      return commit((current) => {
        const collapsed = !current.bottomTimelineCollapsed;
        return {
          ...current,
          bottomTimelineCollapsed: collapsed,
          bottomDock: { ...current.bottomDock, expanded: !collapsed }
        };
      }, true);
    }
  };
  return commands;
}

function addMainPane(
  current: AutomationWorkspacePrefs,
  viewId: string,
  paneId = nextAutomationPaneId(current.panes)
): AutomationWorkspacePrefs {
  const pane: AutomationWorkspacePane = {
    id: paneId,
    activeViewId: viewId,
    tabs: [viewId]
  };
  const panes = [...current.panes, pane];
  const preset = automationMainLayoutPresetForPaneCount(panes.length, current.mainLayoutPreset);
  return {
    ...current,
    activePaneId: pane.id,
    activeViewId: viewId,
    panes,
    mainLayoutPreset: preset,
    mainSplitRatios: defaultAutomationMainSplitRatios(preset),
    maximizedWindowId: null
  };
}

function resizeMainPanesForPreset(
  current: AutomationWorkspacePrefs,
  preset: AutomationWorkspacePrefs["mainLayoutPreset"]
): AutomationWorkspacePrefs {
  const targetCount = Math.min(automationWorkspaceMaxMainPanes, automationMainPaneCount(preset));
  const panes = current.panes.slice(0, targetCount).map((pane) => ({ ...pane, tabs: uniqueTabs(pane.tabs) }));
  const removedTabs = current.panes.slice(targetCount).flatMap((pane) => pane.tabs);
  if (panes.length && removedTabs.length) {
    const last = panes[panes.length - 1]!;
    last.tabs = uniqueTabs([...last.tabs, ...removedTabs]);
  }
  if (!panes.length) {
    panes.push({ ...defaultAutomationWorkspacePanes()[0]!, tabs: [...defaultAutomationWorkspacePanes()[0]!.tabs] });
  }

  removeDuplicatePaneOwnership(panes);
  while (panes.length < targetCount) {
    const used = new Set(panes.flatMap((pane) => pane.tabs));
    let viewId: string | undefined = uniqueMainPaneFallbacks.find((candidate) => !used.has(candidate));
    if (!viewId) {
      const donor = panes.find((pane) => pane.tabs.length > 1);
      viewId = donor?.tabs.find((candidate) => candidate !== donor.activeViewId);
      if (donor && viewId) donor.tabs = donor.tabs.filter((candidate) => candidate !== viewId);
    }
    if (!viewId) break;
    panes.push({ id: nextAutomationPaneId(panes), activeViewId: viewId, tabs: [viewId] });
  }

  const activePane = panes.find((pane) => pane.id === current.activePaneId) ?? panes[0]!;
  return {
    ...current,
    activePaneId: activePane.id,
    activeViewId: activePane.activeViewId,
    mainLayoutPreset: preset,
    mainSplitRatios: defaultAutomationMainSplitRatios(preset),
    panes,
    maximizedWindowId: null
  };
}

function removeDuplicatePaneOwnership(panes: AutomationWorkspacePane[]): void {
  const claimed = new Set<string>();
  for (const pane of panes) {
    pane.tabs = pane.tabs.filter((viewId) => {
      if (claimed.has(viewId)) return false;
      claimed.add(viewId);
      return true;
    });
    if (!pane.tabs.length) {
      const fallback = uniqueMainPaneFallbacks.find((viewId) => !claimed.has(viewId));
      if (fallback) {
        pane.tabs = [fallback];
        claimed.add(fallback);
      }
    }
    pane.activeViewId = pane.tabs.includes(pane.activeViewId) ? pane.activeViewId : pane.tabs[0] ?? "";
  }
}

function uniqueTabs(tabs: string[]): string[] {
  return tabs.filter((tab, index) => tabs.indexOf(tab) === index);
}

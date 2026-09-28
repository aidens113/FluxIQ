import type { AutomationWorkspacePrefs } from "../layout/contracts";
import { defaultAutomationRightSidebarPrefs } from "../layout/defaults";
import { closeAutomationWorkspacePaneTab, moveAutomationWorkspacePaneTab } from "../layout/mutations";
import { automationWorkspaceRegionForView } from "../layout/regions";
import type {
  AutomationWorkspaceCommandPort,
  AutomationWorkspaceCommands,
  AutomationWorkspaceRegionActivation
} from "./contracts";
import type { AutomationWarmViewRegistry } from "./warm-activation";
import { chooseAutomationMainPane, nextAutomationPaneId } from "./pane-choice";
import { addMainPane, automationWorkspaceMaxMainPanes, resizeMainPanesForPreset, uniqueTabs } from "./pane-layout";
import { automationClosingTabLabel, createAutomationPreviewTabRegistry } from "./preview-tabs";
import { requestDirtyViewDecision } from "../dirty-view-registry";

export { automationClosingTabLabel } from "./preview-tabs";
export { automationWorkspaceMaxMainPanes } from "./pane-layout";

/**
 * How an activation treats the pane's preview tab: leave it as it is, make this
 * view the preview, or keep this view for good.
 */
type AutomationPaneActivationMode = "keep" | "preview" | "pin";

export function createAutomationWorkspaceCommands(options: {
  port: AutomationWorkspaceCommandPort;
  warm?: AutomationWarmViewRegistry;
  onRegionActivated?(activation: AutomationWorkspaceRegionActivation): void;
}): AutomationWorkspaceCommands {
  const { port } = options;
  const defaultRightViewId = defaultAutomationRightSidebarPrefs().activeViewId;
  // At most one preview tab per pane; see `preview-tabs.ts` for why.
  const preview = createAutomationPreviewTabRegistry();
  const notifyRegion = (activation: AutomationWorkspaceRegionActivation) => {
    options.onRegionActivated?.(activation);
  };
  const commit = (update: (current: AutomationWorkspacePrefs) => AutomationWorkspacePrefs, persist = false) => {
    return port.commit(update, { persist, scope: "workspace" });
  };
  const activateMain = (paneId: string, viewId: string, mode: AutomationPaneActivationMode = "keep") => {
    const current = port.read();
    const pane = current.panes.find((candidate) => candidate.id === paneId);
    if (!pane) return false;
    const replaced = mode === "preview" ? preview.replaceable(pane, viewId) : null;
    if (mode === "preview") preview.preview(paneId, viewId);
    if (mode === "pin") preview.pin(paneId, viewId);
    const unchanged = current.activePaneId === paneId
      && current.activeViewId === viewId
      && pane.activeViewId === viewId
      && pane.tabs.includes(viewId)
      && !replaced;
    if (unchanged) return false;
    const changed = commit((latest) => {
      const latestPane = latest.panes.find((candidate) => candidate.id === paneId);
      if (!latestPane) return latest;
      if (!replaced
        && latest.activePaneId === paneId
        && latest.activeViewId === viewId
        && latestPane.activeViewId === viewId
        && latestPane.tabs.includes(viewId)) return latest;
      return {
        ...latest,
        activePaneId: paneId,
        activeViewId: viewId,
        // The outgoing preview leaves in the same commit the incoming one
        // arrives in, so the strip never flickers through a state with both.
        // `viewId` is always in the result, so the filter cannot empty a pane.
        panes: latest.panes.map((candidate) => candidate.id === paneId
          ? { ...candidate, activeViewId: viewId, tabs: uniqueTabs([...candidate.tabs, viewId]).filter((tab) => tab !== replaced) }
          : candidate)
      };
    }, true);
    if (changed) notifyRegion({ region: "main", paneId, viewId });
    return changed;
  };
  const activateRight = (viewId: string) => {
    const current = port.read();
    const unchanged = !current.rightSidebarCollapsed
      && !current.rightSidebar.collapsed
      && current.rightSidebar.activeViewId === viewId
      && current.rightSidebar.tabs.includes(viewId);
    if (unchanged) return false;
    const changed = commit((latest) => {
      if (!latest.rightSidebarCollapsed
        && !latest.rightSidebar.collapsed
        && latest.rightSidebar.activeViewId === viewId
        && latest.rightSidebar.tabs.includes(viewId)) return latest;
      return {
        ...latest,
        rightSidebarCollapsed: false,
        rightSidebar: {
          ...latest.rightSidebar,
          activeViewId: viewId,
          collapsed: false,
          tabs: uniqueTabs([...latest.rightSidebar.tabs, viewId])
        }
      };
    }, true);
    if (changed) notifyRegion({ region: "right", paneId: "right-sidebar", viewId });
    return changed;
  };
  const commands: AutomationWorkspaceCommands = {
    openView(viewId, mode = "preview") {
      const region = automationWorkspaceRegionForView(viewId);
      if (region === "bottom") {
        const changed = commit((current) => current.bottomDock.expanded
          && !current.bottomTimelineCollapsed
          && current.maximizedWindowId === null
          ? current
          : {
            ...current,
            bottomTimelineCollapsed: false,
            bottomDock: { ...current.bottomDock, expanded: true },
            maximizedWindowId: null
          }, true);
        if (changed) notifyRegion({ region, paneId: "bottom-dock", viewId });
        return changed;
      }
      if (region === "right") return activateRight(viewId);
      const current = port.read();
      if (mode === "new-pane-or-focus" && !current.panes.some((pane) => pane.tabs.includes(viewId))) {
        if (current.panes.length >= automationWorkspaceMaxMainPanes) return false;
        const paneId = nextAutomationPaneId(current.panes);
        const changed = commit((latest) => latest.panes.length >= automationWorkspaceMaxMainPanes
          ? latest
          : addMainPane(latest, viewId, paneId), true);
        if (changed) notifyRegion({ region: "main", paneId, viewId });
        return changed;
      }
      const pane = chooseAutomationMainPane(current, viewId);
      return pane ? activateMain(pane.id, viewId, mode === "preview" ? "preview" : "pin") : false;
    },
    activatePane(paneId) {
      const pane = port.read().panes.find((candidate) => candidate.id === paneId);
      return pane ? activateMain(pane.id, pane.activeViewId) : false;
    },
    // Clicking a tab leaves its preview standing: the person is reading it, not
    // deciding to keep it. Adding one from the palette is that decision, so it
    // pins.
    selectPaneTab: (paneId, viewId) => activateMain(paneId, viewId),
    addPaneTab: (paneId, viewId) => activateMain(paneId, viewId, "pin"),
    closePaneTab(paneId, viewId) {
      if (!port.read().panes.some((pane) => pane.id === paneId && pane.tabs.includes(viewId))) return false;
      return requestDirtyViewDecision({ actionLabel: automationClosingTabLabel(viewId), viewIds: [viewId], proceed: () => {
        preview.forget(paneId, viewId);
        commit((current) => ({
          ...current,
          ...closeAutomationWorkspacePaneTab(current.panes, paneId, viewId, current.activePaneId, current.mainLayoutPreset)
        }), true);
      } });
    },
    movePaneTab(sourcePaneId, targetPaneId, viewId, targetViewId = null, placement = "end") {
      if (sourcePaneId === targetPaneId && targetViewId === viewId) return false;
      // A tab the person dragged somewhere is a tab they meant to keep.
      preview.forget(sourcePaneId, viewId);
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
      return requestDirtyViewDecision({ actionLabel: automationClosingTabLabel(viewId), viewIds: [viewId], proceed: () => {
        commit((current) => {
          const tabs = current.rightSidebar.tabs.filter((tab) => tab !== viewId);
          const nextTabs = tabs.length ? tabs : [defaultRightViewId];
          return {
            ...current,
            rightSidebar: {
              ...current.rightSidebar,
              tabs: nextTabs,
              activeViewId: current.rightSidebar.activeViewId === viewId ? nextTabs[0] ?? defaultRightViewId : current.rightSidebar.activeViewId
            }
          };
        }, true);
      } });
    },
    applyLayoutPreset(preset) {
      if (port.read().mainLayoutPreset === preset) return false;
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

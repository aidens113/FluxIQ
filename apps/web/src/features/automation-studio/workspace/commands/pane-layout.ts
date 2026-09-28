// Rearranging the main region's panes: adding one, and fitting the existing
// ones to a layout preset without losing a tab or leaving a pane empty.
//
// These are pure transforms over the workspace preferences. They are separate
// from the command surface because the commands decide *when* a pane changes
// and these decide *what the panes then are*, and only the second half needs to
// be readable as arithmetic.

import type { AutomationWorkspacePane, AutomationWorkspacePrefs } from "../layout/contracts";
import { defaultAutomationWorkspacePanes } from "../layout/defaults";
import { automationStudioViewDefinitions } from "../../views";
import {
  automationMainLayoutPresetForPaneCount,
  automationMainPaneCount,
  defaultAutomationMainSplitRatios
} from "../layout/mutations";
import { nextAutomationPaneId } from "./pane-choice";

export const automationWorkspaceMaxMainPanes = 3;

const defaultMainViewId = defaultAutomationWorkspacePanes()[0]!.activeViewId;
const uniqueMainPaneFallbacks = automationStudioViewDefinitions()
  .filter((definition) => definition.region === "main" && definition.id !== defaultMainViewId)
  .map((definition) => definition.id);

export function addMainPane(
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

export function resizeMainPanesForPreset(
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

/** No view is open in two panes at once, and no pane is left with nothing in it. */
export function removeDuplicatePaneOwnership(panes: AutomationWorkspacePane[]): void {
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

export function uniqueTabs(tabs: string[]): string[] {
  return tabs.filter((tab, index) => tabs.indexOf(tab) === index);
}

import { automationStudioViewBaseId } from "../views/view-registry";
import type { AutomationWorkspacePrefs } from "./layout";

export function automationWorkspaceViewStateForBase(
  prefs: Pick<AutomationWorkspacePrefs, "activePaneId" | "panes" | "activeViewId" | "viewStates">,
  baseViewId: string
): Record<string, unknown> | undefined {
  const panes = prefs.panes ?? [];
  const activePane = panes.find((pane) => pane.id === prefs.activePaneId) ?? panes[0];
  const activeViewId = activePane?.activeViewId ?? prefs.activeViewId ?? "";
  if (automationStudioViewBaseId(activeViewId) === baseViewId && prefs.viewStates?.[activeViewId]) {
    return prefs.viewStates[activeViewId];
  }
  if (prefs.viewStates?.[baseViewId]) return prefs.viewStates[baseViewId];
  const matchingId = Object.keys(prefs.viewStates ?? {}).find((viewId) => automationStudioViewBaseId(viewId) === baseViewId);
  return matchingId ? prefs.viewStates?.[matchingId] : undefined;
}

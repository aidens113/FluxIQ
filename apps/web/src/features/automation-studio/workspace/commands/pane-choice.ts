import { automationStudioViewBaseId, automationStudioViewId } from "../../views/view-registry";
import type { AutomationWorkspacePane, AutomationWorkspacePrefs } from "../layout/contracts";

const secondaryViewIds = new Set<string>([automationStudioViewId.state, automationStudioViewId.runtime]);

export function chooseAutomationMainPane(
  prefs: Pick<AutomationWorkspacePrefs, "activePaneId" | "panes">,
  viewId: string
): AutomationWorkspacePane | null {
  const existing = prefs.panes.find((pane) => pane.tabs.includes(viewId));
  if (existing) return existing;
  const baseViewId = automationStudioViewBaseId(viewId);
  if (baseViewId === automationStudioViewId.flowEditor) return prefs.panes[0] ?? null;
  const first = prefs.panes[0];
  const firstOwnsFlow = automationStudioViewBaseId(first?.activeViewId ?? "") === automationStudioViewId.flowEditor
    || first?.tabs.some((tabId) => automationStudioViewBaseId(tabId) === automationStudioViewId.flowEditor);
  if (firstOwnsFlow && secondaryViewIds.has(baseViewId) && prefs.panes[1]) return prefs.panes[1];
  return prefs.panes.find((pane) => pane.id === prefs.activePaneId) ?? first ?? null;
}

export function nextAutomationPaneId(panes: readonly AutomationWorkspacePane[]): string {
  const ids = new Set(panes.map((pane) => pane.id));
  let suffix = panes.length + 1;
  while (ids.has(`pane-main-${suffix}`)) suffix += 1;
  return `pane-main-${suffix}`;
}

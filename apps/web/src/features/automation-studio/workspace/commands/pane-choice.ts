import { automationStudioViewId } from "../../views/view-registry";
import type { AutomationWorkspacePane, AutomationWorkspacePrefs } from "../layout/contracts";

const secondaryViewIds = new Set<string>([automationStudioViewId.state, automationStudioViewId.runtime]);

export function chooseAutomationMainPane(
  prefs: Pick<AutomationWorkspacePrefs, "activePaneId" | "panes">,
  viewId: string
): AutomationWorkspacePane | null {
  const existing = prefs.panes.find((pane) => pane.tabs.includes(viewId));
  if (existing) return existing;
  if (viewId === automationStudioViewId.flowEditor) return prefs.panes[0] ?? null;
  const first = prefs.panes[0];
  const firstOwnsFlow = first?.activeViewId === automationStudioViewId.flowEditor || first?.tabs.includes(automationStudioViewId.flowEditor);
  if (firstOwnsFlow && secondaryViewIds.has(viewId) && prefs.panes[1]) return prefs.panes[1];
  return prefs.panes.find((pane) => pane.id === prefs.activePaneId) ?? first ?? null;
}

export function nextAutomationPaneId(panes: readonly AutomationWorkspacePane[]): string {
  const ids = new Set(panes.map((pane) => pane.id));
  let suffix = panes.length + 1;
  while (ids.has(`pane-main-${suffix}`)) suffix += 1;
  return `pane-main-${suffix}`;
}

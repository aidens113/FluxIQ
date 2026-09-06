import { isAutomationSubflowGraph } from "../model/flow-ownership";
import type { AutomationWorkspacePrefs } from "../workspace/layout";
import {
  automationStudioObjectViewInstanceId,
  automationStudioViewBaseId,
  automationStudioViewId,
  automationStudioViewObjectId
} from "../views/view-registry";

export type AutomationFlowEditorViewRecovery = {
  prefs: AutomationWorkspacePrefs;
  recoveredFlowIds: string[];
};

export function recoverParentBoundFlowEditorViews(
  prefs: AutomationWorkspacePrefs,
  flowEntries: readonly any[]
): AutomationFlowEditorViewRecovery {
  const flows = new Map(flowEntries.flatMap((entry) => {
    const flow = entry?.flow ?? entry;
    return typeof flow?.flowId === "string" ? [[flow.flowId, flow] as const] : [];
  }));
  const recoveredFlowIds = new Set<string>();
  const replacements = new Map<string, string>();

  for (const viewId of new Set(prefs.panes.flatMap((pane) => pane.tabs))) {
    if (automationStudioViewBaseId(viewId) !== automationStudioViewId.flowEditor) continue;
    const state = prefs.viewStates?.[viewId];
    const flowId = automationStudioViewObjectId(viewId)
      ?? (typeof state?.flowId === "string" ? state.flowId : null)
      ?? (typeof state?.lastOpenFlowId === "string" ? state.lastOpenFlowId : null);
    if (!flowId) continue;
    const flow = flows.get(flowId);
    if (!flow || isAutomationSubflowGraph(flow)) continue;
    recoveredFlowIds.add(flowId);
    replacements.set(viewId, automationStudioObjectViewInstanceId(automationStudioViewId.subflows, flowId));
  }
  if (!replacements.size) return { prefs, recoveredFlowIds: [] };

  const panes = prefs.panes.map((pane) => {
    const tabs = [...new Set(pane.tabs.map((viewId) => replacements.get(viewId) ?? viewId))];
    return { ...pane, tabs, activeViewId: replacements.get(pane.activeViewId) ?? pane.activeViewId };
  });
  const viewStates = { ...prefs.viewStates };
  for (const [oldViewId, replacementId] of replacements) {
    const flowId = automationStudioViewObjectId(replacementId)!;
    delete viewStates[oldViewId];
    viewStates[replacementId] = {
      ...(viewStates[replacementId] ?? {}),
      flowId,
      selection: { kind: "flow", id: flowId }
    };
  }
  const activePane = panes.find((pane) => pane.id === prefs.activePaneId) ?? panes[0];
  return {
    prefs: {
      ...prefs,
      panes,
      activeViewId: activePane?.activeViewId ?? replacements.get(prefs.activeViewId) ?? prefs.activeViewId,
      viewStates
    },
    recoveredFlowIds: [...recoveredFlowIds]
  };
}

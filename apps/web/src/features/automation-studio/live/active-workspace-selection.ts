import type { AutomationSelection } from "../shared/selection-contracts";
import type { AutomationWorkspacePrefs } from "../workspace/layout";
import {
  automationStudioViewBaseId,
  automationStudioViewDefinition,
  automationStudioViewId,
  automationStudioViewObjectId
} from "../views/view-registry";
import { isAutomationSelection } from "../model/live-helpers";
import { automationWorkspaceViewStateForBase } from "../workspace/view-state";

export function automationActiveWorkspaceSelection(
  prefs: AutomationWorkspacePrefs,
  liveSelection: AutomationSelection | null
): AutomationSelection | null {
  const activePane = prefs.panes.find((pane) => pane.id === prefs.activePaneId) ?? prefs.panes[0];
  const activeViewId = activePane?.activeViewId ?? prefs.activeViewId;
  const savedActiveSelection = prefs.viewStates?.[activeViewId]?.selection;
  const definition = automationStudioViewDefinition(activeViewId, { hasFlow: true });
  const flowScoped = definition?.functionality.scope.some((scope) => scope === "flow" || scope === "subflow") === true;
  if (!flowScoped) return isAutomationSelection(savedActiveSelection) ? savedActiveSelection : liveSelection;
  if (isFlowSelection(savedActiveSelection)) return savedActiveSelection;
  const savedActiveFlowId = prefs.viewStates?.[activeViewId]?.flowId;
  if (typeof savedActiveFlowId === "string" && savedActiveFlowId) return { kind: "flow", id: savedActiveFlowId };
  const instanceFlowId = automationStudioViewObjectId(activeViewId);
  if (instanceFlowId) return { kind: "flow", id: instanceFlowId };
  if (isFlowSelection(liveSelection)) return liveSelection;
  const flowState = automationWorkspaceViewStateForBase(prefs, automationStudioViewId.flowEditor);
  if (isFlowSelection(flowState?.selection)) return flowState.selection;
  return typeof flowState?.lastOpenFlowId === "string" && flowState.lastOpenFlowId
    ? { kind: "flow", id: flowState.lastOpenFlowId }
    : liveSelection;
}

export function bindAutomationActiveFlowView(
  prefs: AutomationWorkspacePrefs,
  selection: AutomationSelection
): AutomationWorkspacePrefs {
  const flowId = selection.kind === "flow"
    ? selection.id
    : (selection.kind === "editor-node" || selection.kind === "editor-mode") ? selection.flowId : undefined;
  if (!flowId) return prefs;
  const activePane = prefs.panes.find((pane) => pane.id === prefs.activePaneId) ?? prefs.panes[0];
  const activeViewId = activePane?.activeViewId ?? prefs.activeViewId;
  const definition = automationStudioViewDefinition(activeViewId, { hasFlow: true });
  if (definition?.functionality.scope.some((scope) => scope === "flow" || scope === "subflow") !== true) return prefs;
  const current = prefs.viewStates?.[activeViewId] ?? {};
  if (current.flowId === flowId && current.selection === selection) return prefs;
  return {
    ...prefs,
    viewStates: {
      ...prefs.viewStates,
      [activeViewId]: {
        ...current,
        flowId,
        selection,
        ...(automationStudioViewBaseId(activeViewId) === automationStudioViewId.flowEditor ? { lastOpenFlowId: flowId } : {})
      }
    }
  };
}

export function bindAutomationUnboundFlowViews(prefs: AutomationWorkspacePrefs): AutomationWorkspacePrefs {
  const flowState = automationWorkspaceViewStateForBase(prefs, automationStudioViewId.flowEditor);
  const seed = isFlowSelection(flowState?.selection)
    ? flowState.selection
    : typeof flowState?.lastOpenFlowId === "string" && flowState.lastOpenFlowId
      ? { kind: "flow" as const, id: flowState.lastOpenFlowId }
      : null;
  if (!seed) return prefs;
  let viewStates = prefs.viewStates;
  for (const viewId of new Set(prefs.panes.flatMap((pane) => pane.tabs))) {
    const definition = automationStudioViewDefinition(viewId, { hasFlow: true });
    if (definition?.functionality.scope.some((scope) => scope === "flow" || scope === "subflow") !== true) continue;
    const current = viewStates?.[viewId] ?? {};
    const currentSelection = isFlowSelection(current.selection) ? current.selection : null;
    const currentFlowId = typeof current.flowId === "string" && current.flowId
      ? current.flowId
      : currentSelection ? flowIdForSelection(currentSelection) : undefined;
    if (currentFlowId && current.flowId === currentFlowId) continue;
    const selection = currentSelection ?? seed;
    viewStates = {
      ...viewStates,
      [viewId]: { ...current, flowId: currentFlowId ?? flowIdForSelection(seed), selection }
    };
  }
  return viewStates === prefs.viewStates ? prefs : { ...prefs, viewStates };
}

function isFlowSelection(value: unknown): value is AutomationSelection {
  if (!isAutomationSelection(value)) return false;
  return value.kind === "flow"
    || ((value.kind === "editor-node" || value.kind === "editor-mode") && typeof value.flowId === "string" && Boolean(value.flowId));
}

function flowIdForSelection(selection: AutomationSelection): string | undefined {
  return selection.kind === "flow"
    ? selection.id
    : (selection.kind === "editor-node" || selection.kind === "editor-mode") ? selection.flowId : undefined;
}

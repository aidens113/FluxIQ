import type { AutomationSelection } from "../shared/selection-contracts";
import type {
  InspectorPanelContext,
  InspectorScopedSelectors
} from "./types";

export function selectInspectorPanelContext(
  selectionId: string | null,
  selectors: InspectorScopedSelectors
): InspectorPanelContext | null {
  if (!selectionId) return null;
  const selection = selectors.selection(selectionId);
  if (!selection) return null;
  return {
    selection,
    policy: selectsPolicy(selection) ? selectors.policy(selection) : null,
    flow: selectsFlow(selection) ? selectors.flow(selection) : null,
    node: selectsNode(selection) ? selectors.node(selection) : null,
    recording: selectsRecording(selection) ? selectors.recording(selection) : null,
    entry: selectsEntry(selection) ? selectors.entry(selection) : null,
    signal: selection.kind === "signal" ? selectors.signal(selection) : null,
    timelineEntries: selection.kind === "timeline" ? selectors.timelineEntries(selection) : [],
    flowPublicationCount: selection.kind === "flow" ? selectors.flowPublicationCount(selection) : 0,
    flowDependencies: selection.kind === "flow"
      ? selectors.flowDependencies(selection)
      : { dependencies: 0, usedBy: 0, availableUpgrades: 0 },
    referenceOptions: selection.kind === "editor-node" ? selectors.referenceOptions(selection) : {},
    statePanel: selection.kind === "state" ? selectors.statePanel(selection) : null
  };
}

function selectsPolicy(selection: AutomationSelection): boolean {
  return selection.kind === "policy" || selection.kind === "state";
}

function selectsFlow(selection: AutomationSelection): boolean {
  return selection.kind === "flow" || selection.kind === "editor-node" || selection.kind === "state";
}

function selectsNode(selection: AutomationSelection): boolean {
  return selection.kind === "node"
    || selection.kind === "editor-node"
    || selection.kind === "state";
}

function selectsRecording(selection: AutomationSelection): boolean {
  return selection.kind === "recording" || selection.kind === "timeline" || selection.kind === "state";
}

function selectsEntry(selection: AutomationSelection): boolean {
  return selection.kind === "timeline" || selection.kind === "state";
}
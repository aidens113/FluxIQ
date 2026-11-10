import type { AutomationSelection } from "../../../../../../features/automation-studio/shared/selection-contracts";

/**
 * The step the canvas and the step details agree is picked, in the shape the canvas reads
 * (`selectedNode`): a picked graph step carries its own values, so a change made in the details
 * reaches the canvas through this. Anything else picked (the graph's check, nothing) is no step.
 */
export function selectedEditorNode(selection: AutomationSelection | null): Record<string, unknown> | null {
  if (selection?.kind !== "editor-node") return null;
  return {
    id: selection.id,
    ...selection.node,
    actions: (selection.node.actionTypes ?? []).map((actionType) => ({ actionType })),
    recovery: { strategy: selection.node.family }
  };
}

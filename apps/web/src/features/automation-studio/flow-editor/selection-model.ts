import type { AutomationSelection } from "../shared/selection-contracts";
import type { AutomationFlowNodeData } from "./node-types";

export function flowEditorSelection(id: string, data: AutomationFlowNodeData, flowId?: string): AutomationSelection {
  return {
    kind: "editor-node",
    id,
    ...(flowId ? { flowId } : {}),
    node: {
      label: data.label,
      nodeType: data.isStart ? "start" : "policy",
      family: data.recovery,
      description: data.description,
      ...(data.customDescription !== undefined ? { customDescription: data.customDescription } : {}),
      inputs: data.inputs,
      outputs: data.outputs,
      parameters: data.parameters,
      parameterValues: data.parameterValues,
      ...(data.nodeDefinitionId !== undefined ? { nodeDefinitionId: data.nodeDefinitionId } : {}),
      ...(data.icon !== undefined ? { icon: data.icon } : {}),
      ...(data.metadata !== undefined ? { metadata: data.metadata } : {}),
      actionTypes: data.actionTypes
    }
  };
}

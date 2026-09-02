import type { AutomationNodeParameter, AutomationNodePort } from "fluxiq/automation-studio/nodes";
import type { Node } from "@xyflow/react";
import type { JsonObject } from "../../programs/program-api";

export type AutomationEditorNodeSpec = {
  id: string;
  version: string;
  label: string;
  description: string;
  family: string;
  scope: "policy" | "routine" | "both";
  nodeType: "base" | "custom" | "generated";
  inputs: AutomationNodePort[];
  outputs: AutomationNodePort[];
  parameters: AutomationNodeParameter[];
  icon?: string;
  privileged?: boolean;
  actionTypes?: string[];
  source?: any;
  availability?: any;
};

export type AutomationEditorPaletteGroup = {
  title: string;
  nodes: AutomationEditorNodeSpec[];
};

export type AutomationFlowNodeData = {
  nodeDefinitionId?: string;
  nodeDefinitionVersion?: string;
  label: string;
  description: string;
  customDescription?: string;
  icon?: string;
  actionTypes: string[];
  recovery: string;
  evidenceCount: number;
  readinessCount: number;
  successCount: number;
  inputs: AutomationNodePort[];
  outputs: AutomationNodePort[];
  parameters: AutomationNodeParameter[];
  parameterValues: JsonObject;
  isStart: boolean;
  confidence?: number;
  timeoutMs?: number;
  reviewTone?: "existing" | "proposed" | "locked";
  regionId?: string;
  regionName?: string;
  regionKind?: "deterministic" | "trigger" | "policy";
  metadata?: JsonObject;
};

export const AUTOMATION_FLOW_NODE_WIDTH = 280;
export const AUTOMATION_FLOW_NODE_HEIGHT = 400;

export function automationFlowNodeDimensions(_data: AutomationFlowNodeData): { width: number; height: number } {
  return { width: AUTOMATION_FLOW_NODE_WIDTH, height: AUTOMATION_FLOW_NODE_HEIGHT };
}

export function withAutomationFlowNodeDimensions(
  node: Node<AutomationFlowNodeData>
): Node<AutomationFlowNodeData> {
  const dimensions = automationFlowNodeDimensions(node.data);
  if (
    node.initialWidth === dimensions.width
    && node.initialHeight === dimensions.height
    && node.measured?.width === dimensions.width
    && node.measured?.height === dimensions.height
  ) return node;
  return {
    ...node,
    initialWidth: dimensions.width,
    initialHeight: dimensions.height,
    measured: dimensions
  };
}

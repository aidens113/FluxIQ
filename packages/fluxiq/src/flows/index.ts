import type { FrameworkResult, JsonObject } from "../core/index.ts";
import type { RuntimeInputs, RuntimeOutputs } from "../io/index.ts";

export type FlowNode = {
  id: string;
  type: string;
  params?: JsonObject;
  retry?: FlowRetry;
  position?: {
    x: number;
    y: number;
  };
};

export type FlowRetry = {
  maxAttempts?: number;
  states?: string[];
  delayTicks?: number;
};

export type FlowEdge = {
  from: string;
  to: string;
  when?: string | string[];
  condition?: string;
  probability?: number;
  priority?: number;
  label?: string;
};

export type FlowDocument = {
  id: string;
  domainId?: string | null;
  start: string;
  nodes: FlowNode[];
  edges: FlowEdge[];
  config?: JsonObject;
  metadata?: JsonObject;
};

export type FlowState = {
  flowId: string;
  currentNodeId: string;
  variables: Record<string, unknown>;
  tick: number;
};

export type FlowNodeContext = {
  flow: FlowDocument;
  state: FlowState;
  capabilities: Record<string, unknown>;
  inputs?: RuntimeInputs;
  outputs?: RuntimeOutputs;
};

export type FlowNodeHandler = (
  context: FlowNodeContext,
  node: FlowNode
) => Promise<FrameworkResult> | FrameworkResult;

export type FlowValidationIssue = {
  severity: "error" | "warning";
  code: string;
  message: string;
  nodeId?: string;
};

export function validateFlow(flow: FlowDocument): FlowValidationIssue[] {
  const issues: FlowValidationIssue[] = [];
  const nodeIds = new Set(flow.nodes.map((node) => node.id));

  if (!flow.id.trim()) {
    issues.push({ severity: "error", code: "flow.id.required", message: "Flow id is required" });
  }

  if (!nodeIds.has(flow.start)) {
    issues.push({
      severity: "error",
      code: "flow.start.missing",
      message: `Start node '${flow.start}' does not exist`
    });
  }

  for (const edge of flow.edges) {
    if (!nodeIds.has(edge.from)) {
      issues.push({
        severity: "error",
        code: "flow.edge.source_missing",
        message: `Edge source '${edge.from}' does not exist`
      });
    }
    if (!nodeIds.has(edge.to)) {
      issues.push({
        severity: "error",
        code: "flow.edge.target_missing",
        message: `Edge target '${edge.to}' does not exist`
      });
    }
  }

  return issues;
}

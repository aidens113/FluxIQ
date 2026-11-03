import type { FlowIdProjectRequest } from "./flow.ts";

export type SaveFlowMapRouteGroupRequest = FlowIdProjectRequest & {
  groupId?: string;
  name: string;
  description?: string;
  order?: unknown;
  status?: string;
  collapsed?: unknown;
};

export type DeleteFlowMapRouteGroupRequest = FlowIdProjectRequest & {
  groupId: string;
};

export type SaveFlowMapRouteRequest = FlowIdProjectRequest & {
  ruleId?: string;
  name: string;
  description?: string;
  targetSubflowId: string;
  order?: unknown;
  status?: string;
  groupId?: string | null;
  setAsFallback?: unknown;
  confidence?: unknown;
  conditionSummary?: string;
  conditionSignalPath?: string;
  conditionOperator?: string;
  conditionExpected?: unknown;
  clearCondition?: boolean;
};

export type SaveFlowMapFallbackRequest = FlowIdProjectRequest & {
  kind: "subflow" | "fail";
  targetSubflowId?: string;
  message?: string;
};

export type TestFlowMapRouteConditionRequest = FlowIdProjectRequest & {
  condition?: { signalPath: string; operator: string; expected?: unknown };
  inputs?: Record<string, unknown>;
  currentStateSummary?: Record<string, unknown>;
};

export type MutateFlowMapRouteRequest = FlowIdProjectRequest & {
  ruleId: string;
  action: "move_up" | "move_down" | "duplicate" | "toggle" | "delete";
};

export type DeleteFlowMapRouteRequest = FlowIdProjectRequest & {
  ruleId: string;
};

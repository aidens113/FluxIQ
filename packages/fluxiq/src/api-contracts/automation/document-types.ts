import type { JsonObject } from "../../core/index.ts";

export type ApprovalStatus = "draft" | "proposed" | "approved" | "rejected";

export type Condition = {
  fact: string;
  operator: string;
  value?: unknown;
};

export type ConditionSet = {
  all: Condition[];
  any: Condition[];
  none: Condition[];
  description?: string;
  metadata?: JsonObject;
};

export type AutomationAction = {
  id: string;
  actionId: string;
  name: string;
  parameters: Record<string, unknown>;
  requiredInputs?: string[];
  requiredOutputs?: string[];
  expectedInput?: ConditionSet;
  expectedOutput?: ConditionSet;
  approvalStatus: ApprovalStatus;
  metadata?: JsonObject;
};

export type AutomationStage = {
  id: string;
  name: string;
  order: number;
  entryConditions?: ConditionSet;
  completionConditions?: ConditionSet;
  actions: AutomationAction[];
  metadata?: JsonObject;
};

export type AutomationTask = {
  id: string;
  name: string;
  domainId?: string | null;
  category: string;
  description?: string;
  stages: AutomationStage[];
  activeStageId?: string;
  approvalStatus: ApprovalStatus;
  version: string;
};

export type RecordingEvent = {
  sequence: number;
  timestampMs: number;
  kind: string;
  actionId?: string;
  payload?: JsonObject;
  evidence?: JsonObject;
};

export type AutomationRecording = {
  id: string;
  taskId: string;
  domainId?: string | null;
  name: string;
  status: "draft" | "recording" | "reviewed" | "archived";
  events: RecordingEvent[];
  metadata?: JsonObject;
};

export type DynamicPolicyNode = {
  id: string;
  actionId: string;
  name: string;
  parameters: Record<string, unknown>;
  successCount: number;
  metadata?: JsonObject;
};

export type DynamicPolicyEdge = {
  from: string;
  to: string;
  count: number;
  probability: number;
};

export type DynamicPolicyArtifact = {
  version: 1;
  taskId: string;
  domainId?: string | null;
  builtAt: string;
  nodes: DynamicPolicyNode[];
  edges: DynamicPolicyEdge[];
  diagnostics: JsonObject;
};

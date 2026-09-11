import type { AutomationStudioAdaptationPolicy, AutomationStudioFlowAdaptation, AutomationStudioFlowChangeProposal, AutomationStudioFlowInstruction, AutomationStudioFlowRouter, AutomationStudioFlowRunSummary, AutomationStudioFlowSubflow, AutomationStudioRuntimeSession } from "../../../model/index.ts";

// The per-project JSON indexes and the summary rows they hold. These moved out
// of service.ts with the store that reads and writes them; service.ts re-exports
// the six public summary types under their original names.

export type AutomationStudioSubflowSummary = {
  subflowId: string;
  summaryVersion?: 2;
  graphFlowId?: string;
  flowId: string;
  projectId: string;
  name: string;
  role: AutomationStudioFlowSubflow["role"];
  status: AutomationStudioFlowSubflow["status"];
  parentCategoryId?: string;
  updatedAt: number;
};

export type AutomationStudioInstructionSummary = {
  instructionId: string;
  summaryVersion?: 2;
  flowId?: string;
  projectId: string;
  subflowId?: string;
  title: string;
  scopeKind: AutomationStudioFlowInstruction["scope"]["kind"];
  status: AutomationStudioFlowInstruction["status"];
  requirement: AutomationStudioFlowInstruction["requirement"];
  priority: number;
  updatedAt: number;
};

export type AutomationStudioChangeProposalSummary = {
  proposalId: string;
  flowId: string;
  projectId: string;
  subflowId?: string;
  mode: AutomationStudioFlowChangeProposal["mode"];
  status: AutomationStudioFlowChangeProposal["status"];
  riskLevel: AutomationStudioFlowChangeProposal["riskLevel"];
  patchCount: number;
  updatedAt: number;
};

export type AutomationStudioAdaptationSummary = {
  adaptationId: string;
  flowId: string;
  projectId: string;
  subflowId?: string;
  status: AutomationStudioFlowAdaptation["status"];
  riskLevel: AutomationStudioFlowAdaptation["riskLevel"];
  trigger: string;
  updatedAt: number;
};

export type AutomationStudioRouterSummary = {
  routerId: string;
  flowId: string;
  projectId: string;
  name: string;
  status: AutomationStudioFlowRouter["status"];
  ruleCount: number;
  updatedAt: number;
};

export type AutomationStudioAdaptationPolicySummary = {
  policyId: string;
  flowId: string;
  projectId: string;
  subflowId?: string;
  preset: AutomationStudioAdaptationPolicy["preset"];
  proposalMode: AutomationStudioAdaptationPolicy["proposalMode"];
  updatedAt: number;
};

export type RecordingIndex = {
  recordings: { recordingId: string; taskId?: string; startedAt: number; endedAt?: number; updatedAt: number; eventCount?: number; noteCount?: number }[];
  normalizedTimelines: { normalizedTimelineId: string; recordingId: string; generatedAt: number }[];
};

export type FlowRouterIndex = {
  schemaVersion: "0.1";
  routers: AutomationStudioRouterSummary[];
};

export type FlowSubflowIndex = {
  schemaVersion: "0.1";
  summaryVersion?: 2;
  subflows: AutomationStudioSubflowSummary[];
};

export type FlowInstructionIndex = {
  schemaVersion: "0.1";
  summaryVersion?: 2;
  instructions: AutomationStudioInstructionSummary[];
};

export type FlowChangeProposalIndex = {
  schemaVersion: "0.1";
  changeProposals: AutomationStudioChangeProposalSummary[];
};

export type FlowRunIndex = {
  schemaVersion: "0.1";
  runs: AutomationStudioFlowRunSummary[];
};

export type FlowAdaptationIndex = {
  schemaVersion: "0.1";
  adaptations: AutomationStudioAdaptationSummary[];
};

export type FlowAdaptationPolicyIndex = {
  schemaVersion: "0.1";
  policies: AutomationStudioAdaptationPolicySummary[];
};

export type RuntimeIndex = {
  sessions: { runId: string; targetKind: AutomationStudioRuntimeSession["targetKind"]; targetId: string; status: AutomationStudioRuntimeSession["status"]; updatedAt: number }[];
};

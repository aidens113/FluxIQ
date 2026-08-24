import type { JsonObject, JsonValue } from "../../../core/index.ts";
import type { AutomationConditionExpression } from "./conditions.ts";
import type { EvidenceReference, StateFactReference } from "./evidence.ts";
import type { AutomationStudioFlowScope } from "./flows.ts";

export type AutomationStudioFlowExpansionStatus = "active" | "disabled" | "archived";

export type AutomationStudioRouteTarget = {
  kind: "subflow";
  subflowId: string;
};

export type AutomationStudioFlowRouteRule = {
  schemaVersion: "0.1";
  ruleId: string;
  routerId: string;
  name: string;
  description?: string;
  target: AutomationStudioRouteTarget;
  order: number;
  status: AutomationStudioFlowExpansionStatus;
  condition?: AutomationConditionExpression;
  confidence?: number;
  createdAt: number;
  updatedAt: number;
  metadata?: JsonObject;
};

export type AutomationStudioFlowRouter = {
  schemaVersion: "0.1";
  routerId: string;
  flowId: string;
  projectId: string;
  name: string;
  description?: string;
  rules: AutomationStudioFlowRouteRule[];
  fallback?: AutomationStudioRouteTarget | { kind: "fail"; message?: string };
  status: AutomationStudioFlowExpansionStatus;
  createdAt: number;
  updatedAt: number;
  metadata?: JsonObject;
};

export type AutomationStudioSubflowRole =
  | "primary"
  | "site"
  | "screen"
  | "integration"
  | "recovery"
  | "fallback"
  | "utility";

export type AutomationStudioFlowSubflow = {
  schemaVersion: "0.1";
  subflowId: string;
  flowId: string;
  projectId: string;
  name: string;
  description?: string;
  role: AutomationStudioSubflowRole;
  status: AutomationStudioFlowExpansionStatus;
  tags?: string[];
  graphFlowId?: string;
  routeTags?: string[];
  inputMapping?: Array<{ flowInputId: string; subflowInputId: string; required?: boolean }>;
  outputMapping?: Array<{ subflowOutputId: string; flowOutputId: string; required?: boolean }>;
  localInstructionIds?: string[];
  proposalModeOverride?: AutomationStudioChangeProposalMode;
  stability?: {
    runCount: number;
    successCount: number;
    failureCount: number;
    lastRunAt?: number;
    lastFailureAt?: number;
  };
  createdAt: number;
  updatedAt: number;
  metadata?: JsonObject;
};

export type AutomationStudioInstructionScope =
  | { kind: "global" }
  | { kind: "project"; projectId: string }
  | { kind: "flow"; projectId: string; flowId: string }
  | { kind: "router"; projectId: string; flowId: string; routerId: string }
  | { kind: "subflow"; projectId: string; flowId: string; subflowId: string }
  | { kind: "node"; projectId: string; flowId: string; nodeId: string; subflowId?: string }
  | { kind: "on_error"; projectId: string; flowId: string; subflowId?: string; nodeId?: string }
  | { kind: "adaptation_review"; projectId: string; flowId: string; subflowId?: string };

export type AutomationStudioInstructionTag =
  | "generation"
  | "runtime"
  | "error"
  | "router"
  | "subflow"
  | "review"
  | "safety";

export type AutomationStudioInstructionRequirement = "advisory" | "required";

export type AutomationStudioFlowInstruction = {
  schemaVersion: "0.1";
  instructionId: string;
  title: string;
  body: string;
  scope: AutomationStudioInstructionScope;
  priority: number;
  status: AutomationStudioFlowExpansionStatus;
  requirement: AutomationStudioInstructionRequirement;
  tags?: AutomationStudioInstructionTag[];
  sourceActorId?: string;
  linkedRunIds?: string[];
  linkedAdaptationIds?: string[];
  linkedRecordingIds?: string[];
  linkedSubflowIds?: string[];
  createdAt: number;
  updatedAt: number;
  metadata?: JsonObject;
};

export type AutomationStudioChangeProposalMode = "auto" | "manual" | "mixed";

export type AutomationStudioChangeProposalStatus =
  | "pending"
  | "auto_approved"
  | "approved"
  | "rejected"
  | "applied"
  | "superseded"
  | "cancelled";

export type AutomationStudioChangeProposalKind =
  | "create_subflow"
  | "edit_subflow"
  | "edit_router"
  | "edit_expectation"
  | "edit_action_target"
  | "edit_recovery"
  | "promote_adaptation"
  | "edit_instruction";

export type AutomationStudioChangeProposalPatch = {
  kind: AutomationStudioChangeProposalKind;
  targetId?: string;
  summary: string;
  before?: JsonValue;
  after?: JsonValue;
  metadata?: JsonObject;
};

export type AutomationStudioFlowChangeProposal = {
  schemaVersion: "0.1";
  proposalId: string;
  flowId: string;
  projectId: string;
  subflowId?: string;
  sourceRunId?: string;
  sourceAdaptationId?: string;
  sourceInstructionIds?: string[];
  mode: AutomationStudioChangeProposalMode;
  status: AutomationStudioChangeProposalStatus;
  riskLevel: AutomationStudioAdaptationRiskLevel;
  patches: AutomationStudioChangeProposalPatch[];
  createdBy: "user" | "runtime" | "llm" | "system";
  reviewedBy?: string;
  reviewedAt?: number;
  createdAt: number;
  updatedAt: number;
  metadata?: JsonObject;
};

export type AutomationStudioFlowRunStatus =
  | "queued"
  | "running"
  | "waiting"
  | "succeeded"
  | "failed"
  | "cancelled";

export type AutomationStudioFlowInterventionSummary = {
  interventionId: string;
  kind: AutomationStudioRuntimeInterventionKind;
  reason: string;
  promptVersion?: string;
  provider?: string;
  model?: string;
  tokenUsage?: { inputTokens?: number; outputTokens?: number; totalTokens?: number; estimatedCostUsd?: number };
};

export type AutomationStudioFlowRunSummary = {
  schemaVersion: "0.1";
  runId: string;
  flowId: string;
  projectId: string;
  flowVersion?: string;
  status: AutomationStudioFlowRunStatus;
  startedAt?: number;
  finishedAt?: number;
  updatedAt: number;
  routeDecisionCount: number;
  subflowEntryCount: number;
  actionAttemptCount: number;
  interventionCount: number;
  adaptationCount: number;
  tokenUsage?: { inputTokens?: number; outputTokens?: number; totalTokens?: number; estimatedCostUsd?: number };
  interventionSummaries?: AutomationStudioFlowInterventionSummary[];
  metadata?: JsonObject;
};

export type AutomationStudioRouteDecisionRecord = {
  decisionId: string;
  routerId: string;
  selectedRuleId?: string;
  selectedSubflowId?: string;
  fallbackUsed?: boolean;
  rejectedRuleIds?: string[];
  decidedAt: number;
  metadata?: JsonObject;
};

export type AutomationStudioSubflowExecutionRecord = {
  entryId: string;
  subflowId: string;
  enteredAt: number;
  exitedAt?: number;
  status: AutomationStudioFlowRunStatus;
  metadata?: JsonObject;
};

export type AutomationStudioRuntimeInterventionKind =
  | "diagnosis"
  | "runtime_patch"
  | "router_patch"
  | "subflow_patch"
  | "expectation_patch"
  | "instruction_suggestion"
  | "change_proposal";

export type AutomationStudioFlowIntervention = {
  schemaVersion: "0.1";
  interventionId: string;
  runId: string;
  flowId: string;
  projectId: string;
  kind: AutomationStudioRuntimeInterventionKind;
  reason: string;
  promptVersion?: string;
  provider?: string;
  model?: string;
  instructionIds?: string[];
  contextSummary?: JsonObject;
  structuredResult?: JsonObject;
  validation?: { ok: boolean; issues?: string[] };
  tokenUsage?: { inputTokens?: number; outputTokens?: number; totalTokens?: number; estimatedCostUsd?: number };
  createdAt: number;
  metadata?: JsonObject;
};

export type AutomationStudioFlowRunActionAttemptRecord = {
  attemptId: string;
  nodeId: string;
  definitionId: string;
  order: number;
  status: AutomationStudioFlowRunStatus | "unknown";
  route?: string;
  startedAt: number;
  finishedAt?: number;
  durationMs?: number;
  comparisonStatus?: string;
  message?: string;
  metadata?: JsonObject;
};

export type AutomationStudioFlowRunRecoveryRecord = {
  recoveryId: string;
  attemptId: string;
  nodeId: string;
  selectedKind?: string;
  selectedTargetNodeId?: string;
  selectedEdgeId?: string;
  candidateCount: number;
  reason?: string;
  status: "selected" | "exhausted" | "diagnosis_only";
  createdAt: number;
  metadata?: JsonObject;
};

export type AutomationStudioFlowRunDetail = {
  schemaVersion: "0.1";
  summary: AutomationStudioFlowRunSummary;
  inputs?: JsonObject;
  startingStateRefs?: StateFactReference[];
  routeDecisions: AutomationStudioRouteDecisionRecord[];
  subflows: AutomationStudioSubflowExecutionRecord[];
  actionAttempts?: AutomationStudioFlowRunActionAttemptRecord[];
  recoveryAttempts?: AutomationStudioFlowRunRecoveryRecord[];
  interventions: AutomationStudioFlowIntervention[];
  adaptationIds: string[];
  changeProposalIds: string[];
  evidence?: EvidenceReference[];
  metadata?: JsonObject;
};

export type AutomationStudioAdaptationRiskLevel = "low" | "medium" | "high" | "destructive";

export type AutomationStudioFlowAdaptationStatus =
  | "proposed"
  | "testing"
  | "validated"
  | "applied"
  | "rejected"
  | "disabled"
  | "reverted"
  | "superseded";

export type AutomationStudioFlowAdaptation = {
  schemaVersion: "0.1";
  adaptationId: string;
  flowId: string;
  projectId: string;
  subflowId?: string;
  sourceRunId?: string;
  sourceRecordingIds?: string[];
  sourceInstructionIds?: string[];
  trigger: string;
  observedState?: JsonObject;
  expectedState?: JsonObject;
  failedAction?: JsonObject;
  diagnosis?: string;
  patch: AutomationStudioChangeProposalPatch[];
  validationResults?: Array<{ runId: string; status: "succeeded" | "failed"; checkedAt: number; detail?: string }>;
  appliedTo?: Array<{ kind: "router" | "subflow" | "expectation" | "action_target" | "instruction"; id: string }>;
  status: AutomationStudioFlowAdaptationStatus;
  author: "runtime" | "llm" | "user" | "system";
  riskLevel: AutomationStudioAdaptationRiskLevel;
  proposalId?: string;
  createdAt: number;
  updatedAt: number;
  metadata?: JsonObject;
};

export type AutomationStudioAdaptationPolicyPreset =
  | "locked"
  | "observe"
  | "repair"
  | "adaptive"
  | "autonomous";

export type AutomationStudioAdaptationPolicy = {
  schemaVersion: "0.1";
  policyId: string;
  scope: { kind: "flow"; flowId: string } | { kind: "subflow"; flowId: string; subflowId: string };
  preset: AutomationStudioAdaptationPolicyPreset;
  proposalMode: AutomationStudioChangeProposalMode;
  allowRuntimeRecovery: boolean;
  allowCreateRecoveryPaths: boolean;
  allowModifySubflows: boolean;
  allowCreateSubflows: boolean;
  allowModifyRouter: boolean;
  allowModifyExpectations: boolean;
  allowModifyActionTargets: boolean;
  allowDeleteOrDisableBehavior: boolean;
  allowExternalSideEffects: boolean;
  requireApprovalForDestructiveChanges: boolean;
  requireApprovalForExternalSideEffects: boolean;
  maxInterventionsPerRun?: number;
  maxEstimatedCostUsdPerRun?: number;
  createdAt: number;
  updatedAt: number;
  metadata?: JsonObject;
};

export type AutomationStudioFlowExpansionReferences = {
  routerId?: string;
  subflowIds?: string[];
  instructionIds?: string[];
  changeProposalIds?: string[];
  runIds?: string[];
  adaptationIds?: string[];
  adaptationPolicyId?: string;
};

export type AutomationStudioFlowExpansionInventory = {
  scope: AutomationStudioFlowScope;
  router?: AutomationStudioFlowRouter;
  subflows?: AutomationStudioFlowSubflow[];
  instructions?: AutomationStudioFlowInstruction[];
  changeProposals?: AutomationStudioFlowChangeProposal[];
  adaptations?: AutomationStudioFlowAdaptation[];
  policy?: AutomationStudioAdaptationPolicy;
};

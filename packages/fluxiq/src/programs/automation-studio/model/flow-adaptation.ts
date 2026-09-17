import type { AutomationStudioFailureRecord, AutomationStudioRunDatasetSummary } from "@fluxiq/contracts/automation-studio";
import type { JsonObject, JsonValue } from "../../../core/index.ts";
import type { AutomationConditionExpression } from "./conditions.ts";
import type { EvidenceReference, StateFactReference } from "./evidence.ts";
import type { AutomationStudioFlowScope } from "./flows.ts";
import type { AutomationStudioInterventionMode } from "./flows.ts";

export type AutomationStudioFlowExpansionStatus = "active" | "disabled" | "archived";

export type AutomationStudioRouteTarget = {
  kind: "subflow";
  subflowId: string;
};

export type AutomationStudioFlowRouteGroup = {
  schemaVersion: "0.1";
  groupId: string;
  routerId: string;
  name: string;
  description?: string;
  order: number;
  status: AutomationStudioFlowExpansionStatus;
  collapsed?: boolean;
  createdAt: number;
  updatedAt: number;
  metadata?: JsonObject;
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
  interventionModeOverride?: AutomationStudioInterventionMode;
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
  | "insert_deterministic_path"
  | "promote_adaptation"
  | "edit_instruction";

/**
 * One action node a deterministic recovery path inserts into the graph it
 * repairs. It is a whole node, not a hint: a definition the node runtime can
 * dispatch, the parameters it runs with, the target it acts on, and the
 * expectation its transition is compared against. `edit_recovery` carried only
 * `actionDefinitionIds`, which named definitions but said nothing about what to
 * run them on, so no applier could build a node from it.
 *
 * `target` is written through `actionTargetParameterValues`, so a policy action
 * is re-pointed inside its output payload exactly as an `edit_action_target`
 * patch re-points one, and `expectation` merges over the parameters.
 */
export type AutomationStudioDeterministicPathNode = {
  nodeId: string;
  definitionId: string;
  definitionVersion?: string;
  label?: string;
  parameters?: JsonObject;
  target?: JsonValue;
  expectation?: JsonObject;
};

/**
 * The `after` value of an `insert_deterministic_path` patch: the nodes to
 * insert, and optionally the node the path rejoins once they succeed.
 *
 * The patch's `targetId` is the node that failed. Applying it wires that node's
 * `failed` port into `nodes[0]`, chains each node's `success` port into the
 * next and, when `returnToNodeId` is set, chains the last node's `success` port
 * back into that node. Every inserted node is therefore reachable from the
 * failure it recovers, and only from it, so the recovery ladder's existing
 * `deterministic_path` candidate picks the new failed edge up with no executor
 * change at all.
 */
export type AutomationStudioDeterministicPath = {
  nodes: AutomationStudioDeterministicPathNode[];
  returnToNodeId?: string;
};

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
  /** Structured failure recorded on the attempt. Stored records are parsed again before use. */
  failure?: AutomationStudioFailureRecord;
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
  /** The datasets the run stored, read from the run dataset store. Absent when the run stored none. */
  datasets?: AutomationStudioRunDatasetSummary[];
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

/** Which of the three ways into the flow-improvement loop produced a change. */
export type AutomationStudioFlowChangeEntryPoint = "instruction" | "run_failure" | "edge_case";

/**
 * Where a change came from, whichever entry point produced it. A Flow
 * adaptation keeps it at `metadata.origin`, which the typed store saves whole,
 * so it needs no migration; a Flow Bootstrap adaptation keeps it at `origin`.
 * Ids and Core failure signatures only, never page text or values.
 * `parseAutomationStudioFlowChangeOrigin` is the only reader of a stored one.
 */
export type AutomationStudioFlowChangeOrigin =
  | { entryPoint: "instruction"; instructionIds: string[] }
  | { entryPoint: "run_failure"; runId: string; failedNodeId: string; failureSignature: string }
  | { entryPoint: "edge_case"; instructionIds: string[]; runId?: string; failureSignature?: string };

/**
 * How a validation result was observed: a `trial` of the candidate on the live
 * page before it was saved, or a `replay`, a later run that exercised the
 * applied change with no model call. A result written before kinds existed
 * has none and reads as `trial`. A structural check is never a validation
 * result; it stays in `metadata.structuralChecks`.
 */
export type AutomationStudioFlowChangeValidationKind = "trial" | "replay";

/** One observed run of a change. */
export type AutomationStudioFlowAdaptationValidationResult = {
  runId: string;
  status: "succeeded" | "failed";
  checkedAt: number;
  detail?: string;
  /** Absent on records written before this field existed: read it as `trial`. */
  kind?: AutomationStudioFlowChangeValidationKind;
  /** The verdict's evidence, as check codes only. Present only on a success. */
  basis?: string[];
};

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
  validationResults?: AutomationStudioFlowAdaptationValidationResult[];
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
  recordingIds?: string[];
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

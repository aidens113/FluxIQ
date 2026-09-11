import type { AutomationStudioFailureRecord } from "@fluxiq/contracts/automation-studio";
import type { JsonObject, JsonValue } from "../../../../core/index.ts";
import type { AutomationStudioFlowNode } from "../../model/index.ts";
import type { AutomationNodeExecutionResult, AutomationNodeTargetResolution, AutomationStudioNativeLogEntry } from "../../nodes/index.ts";
import type { AutomationStudioHostRuntimeBoundary, AutomationStudioHostStateSnapshotRef } from "../host-runtime.ts";

export type AutomationStudioGraphRunStatus = "running" | "succeeded" | "failed" | "waiting" | "cancelled";

export type AutomationStudioTransitionComparisonStatus =
  | "matched"
  | "tolerated"
  | "missing_expected_state"
  | "unexpected_state"
  | "action_failed"
  | "timeout"
  | "blocked"
  | "ambiguous"
  | "unknown"
  /** No candidate for the action's target matched; set only from a structured failure record. */
  | "target_not_found"
  /** Several candidates matched the action's target; set only from a structured failure record. */
  | "target_ambiguous";

export type AutomationStudioExpectedTransition = {
  transitionId: string;
  nodeId: string;
  definitionId: string;
  expectedRoute?: string;
  expectedStatus?: AutomationStudioGraphRunStatus;
  expectedOutputs?: Record<string, JsonValue>;
  expectedEffects?: Array<{ type: string; payload?: JsonValue }>;
  expectedState?: JsonObject;
  tolerance?: {
    allowWaiting?: boolean;
    allowSkipped?: boolean;
    toleratedRoutes?: string[];
  };
  metadata?: JsonObject;
};

export type AutomationStudioActualTransition = {
  transitionId: string;
  nodeId: string;
  definitionId: string;
  status: AutomationStudioGraphRunStatus;
  route?: string;
  outputs: Record<string, JsonValue>;
  effects: Array<{ type: string; payload?: JsonValue }>;
  message?: string;
  startedAt: number;
  finishedAt?: number;
  durationMs?: number;
  metadata?: JsonObject;
};

export type AutomationStudioTransitionComparison = {
  comparisonId: string;
  nodeId: string;
  attemptId: string;
  status: AutomationStudioTransitionComparisonStatus;
  expected: AutomationStudioExpectedTransition;
  actual: AutomationStudioActualTransition;
  diffSummary: {
    missingOutputIds: string[];
    unexpectedOutputIds: string[];
    missingEffectTypes: string[];
    unexpectedEffectTypes: string[];
    routeMatched: boolean;
    statusMatched: boolean;
    stateCheckCount: number;
  };
  message?: string;
  metadata?: JsonObject;
};

export type AutomationStudioRecoveryLookupInput = {
  nodeId: string;
  definitionId: string;
  attemptId: string;
  comparisonStatus: AutomationStudioTransitionComparisonStatus;
  currentSubflowId?: string;
  failedRoute?: string;
};

export type AutomationStudioRecoveryCandidate = {
  kind: "deterministic_path" | "approved_runtime_patch" | "reroute" | "llm_diagnosis";
  priority: number;
  label: string;
  targetNodeId?: string;
  edgeId?: string;
  subflowId?: string;
  reason: string;
};

export type AutomationStudioRecoveryDecision = {
  lookup: AutomationStudioRecoveryLookupInput;
  candidates: AutomationStudioRecoveryCandidate[];
  selected?: AutomationStudioRecoveryCandidate;
  metadata?: JsonObject;
};

export type AutomationStudioRecoveryBudget = {
  maxRetriesPerAction?: number;
  maxRecoveryAttemptsPerSubflow?: number;
  maxReroutesPerRun?: number;
  maxAdaptationOrLlmAttemptsPerRun?: number;
};

export type AutomationStudioNodeAttemptTrace = {
  attemptId: string;
  nodeId: string;
  definitionId: string;
  startedAt: number;
  finishedAt?: number;
  status: AutomationStudioGraphRunStatus;
  route?: string;
  inputs: Record<string, JsonValue>;
  outputs: Record<string, JsonValue>;
  effects: Array<{ type: string; payload?: JsonValue }>;
  message?: string;
  /** Structured failure from the node result; comparison and classification read it before `message`. */
  failure?: AutomationStudioFailureRecord;
  childTrace?: AutomationStudioGraphExecutionTrace;
  compositeTarget?: { flowId: string; version: string; flowDigest: string };
  regionId?: string;
  policyDecision?: { outcome: "selected" | "rejected" | "waiting"; reason: string; outputId?: string; confirmationInputId?: string };
  transitionComparison?: AutomationStudioTransitionComparison;
  recoveryDecision?: AutomationStudioRecoveryDecision;
  logs?: AutomationStudioNativeLogEntry[];
  stateRefs?: {
    beforeAction?: AutomationStudioHostStateSnapshotRef;
    afterAction?: AutomationStudioHostStateSnapshotRef;
    stateDiff?: JsonObject;
  };
  /** How the action's element target was resolved before dispatch, when the node dispatched one. */
  targetResolution?: AutomationNodeTargetResolution;
  hostCapabilities?: string[];
};

export type AutomationStudioGraphExecutionTrace = {
  status: AutomationStudioGraphRunStatus;
  startedAt: number;
  finishedAt?: number;
  currentNodeId?: string;
  attempts: AutomationStudioNodeAttemptTrace[];
  values: Record<string, JsonValue>;
  effects: Array<{ type: string; payload?: JsonValue; nodeId: string }>;
  regionTransitions?: Array<{ handoffId: string; fromRegionId: string; toRegionId: string; edgeId: string; at: number }>;
  message?: string;
};

export type AutomationStudioGraphExecutionOptions = {
  startNodeId?: string;
  inputs?: Record<string, JsonValue>;
  variables?: Record<string, JsonValue>;
  maxSteps?: number;
  random?: () => number;
  now?: () => number;
  signal?: AbortSignal;
  /** Absolute parent deadline inherited by nested Call Flow executions. */
  deadlineAt?: number;
  /** Resolves runtime effects such as importer-owned policy outputs. */
  effectDispatcher?: (effect: { type: string; payload?: JsonValue }, context?: { signal?: AbortSignal }) => Promise<AutomationNodeExecutionResult | undefined> | AutomationNodeExecutionResult | undefined;
  /** Executes a pinned composite Flow when no built-in implementation exists. */
  compositeExecutor?: (request: { node: AutomationStudioFlowNode; inputs: Record<string, JsonValue>; options: AutomationStudioGraphExecutionOptions }) => Promise<{ result: AutomationNodeExecutionResult; childTrace?: AutomationStudioGraphExecutionTrace; compositeTarget?: { flowId: string; version: string; flowDigest: string } } | undefined>;
  /** Executes explicitly bound importer or trusted-local Code Node implementations. */
  nativeNodeExecutor?: (request: { node: AutomationStudioFlowNode; inputs: Record<string, JsonValue>; signal?: AbortSignal; hostContext?: { currentStateRef?: AutomationStudioHostStateSnapshotRef; previousStateRef?: AutomationStudioHostStateSnapshotRef; capabilityIds: string[]; sideEffectClass: "none" | "internal" | "external" | "destructive"; target?: JsonValue } }) => Promise<{ result: AutomationNodeExecutionResult; logs?: AutomationStudioNativeLogEntry[] } | undefined>;
  nodeRegionIds?: Record<string, string>;
  regionRuntime?: {
    regions: Array<{ id: string; kind?: "deterministic" | "trigger" | "policy"; timeoutMs?: number; requiredRuntimeCapabilities?: string[] }>;
    handoffs: Array<{ id: string; fromRegionId: string; fromPortId: string; toRegionId: string; toPortId: string }>;
    nodeRegionIds: Record<string, string>;
  };
  runtimeCapabilities?: Iterable<string>;
  /** Domain capabilities actually bound by the importer for this run. */
  authorizedDomainIds?: Iterable<string>;
  currentSubflowId?: string;
  approvedRuntimePatchNodeIds?: Iterable<string>;
  recoveryBudget?: AutomationStudioRecoveryBudget;
  hostRuntime?: AutomationStudioHostRuntimeBoundary;
};

import type {
  AutomationStudioFailureRecord,
  AutomationStudioRecordSchema,
  AutomationStudioRecordWriteMode,
  AutomationStudioRunDatasetSummary
} from "@fluxiq/contracts/automation-studio";
import type { JsonObject, JsonValue } from "../../../../core/index.ts";
import type { AutomationStudioFlowNode } from "../../model/index.ts";
import type { AutomationNodeExecutionResult, AutomationNodeTargetResolution, AutomationStudioNativeLogEntry } from "../../nodes/index.ts";
import type { FluxIQRuntimeWithheldValues } from "../../../../runtime/index.ts";
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
  /**
   * The saved changes (adaptation ids) the executed node carried in
   * `metadata.adaptationIds`, copied when it ran, in the node's order. Present
   * only when that list was well formed and non-empty, so a replay can name the
   * changes it exercised without asking a model. Malformed metadata leaves it
   * absent rather than partly trusted.
   */
  adaptationIds?: string[];
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

/**
 * The rows one record output captured from one successful dispatch, handed to
 * `onRecordBatch`. `rows` is the array the node's `records` output holds and the
 * one put back at `recordsPath` inside its `result`: validated by allowlist
 * copy, so it holds `include` fields only, in schema order.
 */
export type AutomationStudioRecordBatch = {
  nodeId: string;
  attemptId: string;
  /**
   * Names this capture uniquely within the run, and identically when the run is
   * run again: the attempt ids of the Call Flow attempts enclosing the capturing
   * run, outermost first, then `attemptId`, joined with `/`. Each id has `%` and
   * `/` escaped as `%25` and `%2F`, so `/` occurs only between ids. `attemptId`
   * alone repeats inside a Call Flow child, whose attempts are numbered from 1.
   */
  batchKey: string;
  datasetId: string;
  label?: string;
  writeMode: AutomationStudioRecordWriteMode;
  /** The stored schema (`storedAutomationStudioRecordSchema`): no `exclude` field. */
  schema: AutomationStudioRecordSchema;
  schemaDigest?: string;
  rows: JsonObject[];
  /** Rows the schema refused. */
  invalidCount: number;
  /** True when the output returned more rows than the record output keeps. */
  truncated: boolean;
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
  /**
   * Resolves runtime effects such as importer-owned policy outputs. The context's
   * `withheldValues` holds every value the run has resolved out of state so far,
   * for a dispatcher that keeps its own record of the command; the effect itself
   * carries the real value.
   */
  effectDispatcher?: (effect: { type: string; payload?: JsonValue }, context?: { signal?: AbortSignal; withheldValues?: FluxIQRuntimeWithheldValues }) => Promise<AutomationNodeExecutionResult | undefined> | AutomationNodeExecutionResult | undefined;
  /**
   * Stores the rows a record output captured. Called once per capture, after
   * the dispatch succeeded and before the attempt is returned. A throw fails the
   * attempt with `record_output.persist_failed`. With or without a hook, the
   * node still emits `records`, and the saved trace holds markers, not rows.
   */
  onRecordBatch?: (batch: AutomationStudioRecordBatch) => Promise<AutomationStudioRunDatasetSummary> | AutomationStudioRunDatasetSummary;
  /**
   * Attempt ids of the Call Flow attempts enclosing this run, outermost first,
   * for `AutomationStudioRecordBatch.batchKey`. The executor extends it on the
   * options it hands `compositeExecutor`, which passes them on to the child run,
   * as the canonical composite executor does by spreading them. A host starting
   * a run leaves it unset.
   */
  callFlowAttemptPath?: string[];
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
  /**
   * Whether the recovery ladder may offer its `llm_diagnosis` rung. `false` when the
   * run's LLM setting is off; absent keeps the rung available, subject to the budget.
   */
  allowLlmDiagnosis?: boolean;
  hostRuntime?: AutomationStudioHostRuntimeBoundary;
};

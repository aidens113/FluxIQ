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
import type { AutomationStudioAskKind, AutomationStudioParkedRun, AutomationStudioParkingPort } from "../parking/index.ts";
import type { AutomationStudioRecordedState } from "./recorded-state.ts";

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

/**
 * The rungs of the recovery ladder, cheapest first, with the model last.
 *
 * The four in `AUTOMATION_STUDIO_LADDER_RUNG_KINDS` are the deterministic ones
 * the executor runs itself. Each is **consumed** once it has run and is not
 * offered again for the same arrival at the node, because any
 * non-`llm_diagnosis` candidate still on offer tells
 * `classifyAutomationStudioAdaptiveFailure` that a deterministic answer exists
 * and permanently suppresses escalation to the model.
 */
export type AutomationStudioRecoveryCandidateKind =
  /** The state the node was to produce already holds, so the action already happened: skip it rather than repeat it. */
  | "skip_satisfied_node"
  /** Wait for the state the node expected, up to its recorded wait ceiling, then attempt it again. */
  | "await_recorded_state"
  /** Run a Flow node that clears known interference -- an overlay, a consent wall -- then attempt the node again. */
  | "clear_interference"
  /** Attempt the same node again under its retry policy. */
  | "retry_node"
  | "deterministic_path"
  | "approved_runtime_patch"
  | "reroute"
  | "llm_diagnosis";

/** The rungs the executor runs itself, in ladder order. */
export const AUTOMATION_STUDIO_LADDER_RUNG_KINDS = Object.freeze([
  "skip_satisfied_node",
  "await_recorded_state",
  "clear_interference",
  "retry_node"
] as const);

export type AutomationStudioLadderRungKind = (typeof AUTOMATION_STUDIO_LADDER_RUNG_KINDS)[number];

export type AutomationStudioRecoveryCandidate = {
  kind: AutomationStudioRecoveryCandidateKind;
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
  /**
   * Which attempt of this node this is, and why it was attempted again. Present
   * from the second attempt onwards, so a trace says plainly that the ladder,
   * not the Flow, put the node back on the page.
   */
  retry?: {
    attemptNumber: number;
    maxAttempts: number;
    backoffMs: number;
    /** The ladder rung that asked for this attempt. */
    rung: AutomationStudioLadderRungKind;
    previousAttemptId: string;
  };
  /**
   * What the run did about the state this node expected to find before it ran.
   * `satisfied: false` is a mark, not a failure: the recording is evidence the
   * action was possible at that point, so the node is attempted anyway.
   */
  readiness?: {
    ceilingMs: number;
    waitedMs: number;
    satisfied: boolean;
    checkedConditionCount: number;
    message?: string;
  };
  /**
   * The recorded state this node was taken in, read from its metadata at
   * execution time. Carried on the attempt so a diagnosis -- deterministic or
   * the model's -- names the snapshot the run was supposed to be standing in.
   */
  recordedState?: AutomationStudioRecordedState;
  /**
   * The question this attempt put to a person, and what became of it.
   * `pending` is a run that parked here and has not been answered yet;
   * `answered` or `expired` is a resumed run's record of how it went on, and
   * `route` the way it left this node. An attempt carries this whether or not
   * anybody was reachable, so a trace never has to be read to work out that
   * something was waiting.
   */
  ask?: {
    askId: string;
    kind: AutomationStudioAskKind;
    parks: boolean;
    status: "pending" | "answered" | "expired";
    route?: string;
    settledAtMs?: number;
  };
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
  /**
   * Present on a `waiting` trace whose run stopped on a question: everything
   * `resumeAutomationStudioGraph` needs to go on from the answer. It rides on
   * the trace because the trace is what a host already persists, so a parked
   * run keeps for as long as its run record does and needs no store of its own.
   *
   * It is the *saved* trace's copy, so it holds what the saved trace holds:
   * withheld values where the run resolved one out of state, and dataset
   * markers where it captured rows. A host resuming in the same process should
   * park from the executed trace `onExecutedTrace` hands it, which holds
   * neither.
   */
  parked?: AutomationStudioParkedRun;
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
  /**
   * How the run waits between retry attempts. A real timer by default; a test
   * or a simulator supplies its own so a backoff costs no wall clock.
   */
  delay?: (ms: number, signal?: AbortSignal) => Promise<void>;
  /**
   * The retry policy every node of this run starts from, overriding Core's
   * default of three attempts at 250 ms, 1 s and 2 s. A Flow's own metadata and
   * a node's own declaration both outrank it, and `maxRetriesPerAction` caps it.
   */
  retryPolicy?: { maxAttempts: number; backoffMs: readonly number[] };
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
  /**
   * Where a question this run raises is put to a person, and -- for a host that
   * can hold a run open -- where the answer comes back from. Unbound, a run
   * that reaches a question still parks and is still resumable; nobody is told
   * about it.
   */
  parking?: AutomationStudioParkingPort;
};

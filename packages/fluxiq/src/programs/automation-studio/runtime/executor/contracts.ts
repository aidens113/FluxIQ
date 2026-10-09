import type {
  AutomationStudioFailureRecord,
  AutomationStudioRecordProcessing,
  AutomationStudioRecordSchema,
  AutomationStudioRecordWriteMode,
  AutomationStudioRunDatasetSummary
} from "@fluxiq/contracts/automation-studio";
import type { JsonObject, JsonValue } from "../../../../core/index.ts";
import type { AutomationStudioFlowNode } from "../../model/index.ts";
import type { AutomationNodeExecutionResult, AutomationNodePort, AutomationNodeTargetResolution, AutomationStudioNativeLogEntry } from "../../nodes/index.ts";
import type { FluxIQRuntimeWithheldValues } from "../../../../runtime/index.ts";
import type { AutomationStudioHostRuntimeBoundary, AutomationStudioHostStateSnapshotRef } from "../host-runtime.ts";
import type { AutomationStudioAskKind, AutomationStudioParkedRun, AutomationStudioParkingPort } from "../parking/index.ts";
import type { AutomationStudioRunControlGate } from "../run-control/index.ts";
import type { AutomationStudioRecordedState } from "./recorded-state.ts";
import type { AutomationStudioDefenceSummary, AutomationStudioFaultAssessment } from "./defensive/index.ts";

export type AutomationStudioGraphRunStatus = "running" | "succeeded" | "failed" | "waiting" | "cancelled";

/**
 * Why a run that ended `succeeded` stopped short of the Flow's end.
 * `stopped_at_node`: it was a partial run (`stopAfterNodeId`) and reached its
 * stop node, or a state route would have taken it past that node.
 */
export type AutomationStudioGraphRunStopReason = "stopped_at_node";

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

/** Which way a state route went from the step that could not run: ahead of it in the graph, or only behind it. */
export type AutomationStudioStateRouteDirection = "forward" | "backward";

/**
 * What state routing decided for one step that could not run.
 *
 * - `effect_holds`: the page already shows what the step itself does (its
 *   recorded effect, per the host), so the run went on along the step's own
 *   success edge to `toNodeId`, forward. `matched` is 0: no pre-state was compared.
 * - `routed`: the page matched `toNodeId`'s recorded pre-state and the run went on there.
 * - `no_match`: the page was read and matched no eligible node.
 * - `unobserved`: the host could not read or sign the page.
 * - `no_pre_states`: no other node recorded a pre-state, so nothing was read.
 * - `guard_stopped`: the match was a return to a node without progress past the limit.
 *
 * `candidates` counts the other nodes with a recorded pre-state; `matched` the
 * ones whose pre-state held and that were eligible to run.
 */
export type AutomationStudioStateRoutingRecord = {
  outcome: "effect_holds" | "routed" | "no_match" | "unobserved" | "no_pre_states" | "guard_stopped";
  candidates: number;
  matched: number;
  toNodeId?: string;
  direction?: AutomationStudioStateRouteDirection;
  closeness?: number;
  reason?: string;
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
  /**
   * How the default defensive policy read this attempt's failure: what the fault
   * was, whether the run absorbs it, and why either way.
   *
   * Stamped where the fault was seen -- at the dispatch seam, with the thrown
   * value still in hand -- because that is the richest evidence there will ever
   * be, and a classification re-derived later from a message is a guess at what
   * was already known.
   */
  fault?: AutomationStudioFaultAssessment;
  childTrace?: AutomationStudioGraphExecutionTrace;
  compositeTarget?: { flowId: string; version: string; flowDigest: string };
  regionId?: string;
  policyDecision?: { outcome: "selected" | "rejected" | "waiting"; reason: string; outputId?: string; confirmationInputId?: string };
  transitionComparison?: AutomationStudioTransitionComparison;
  recoveryDecision?: AutomationStudioRecoveryDecision;
  /**
   * Set when the run skipped this node rather than ran it: a sometimes-present
   * step (a popup, a banner, a consent prompt) whose target was observed not to
   * be on the page (`step-skip/absent-step.ts`). The attempt then reads `status:
   * "succeeded"`, `route: "skipped"`, and carries no `failure`, `fault`,
   * `message` or `recoveryDecision`, because a step that was not shown did not
   * fail. `code` is what observed it: the host's failure code
   * (`web.target.not_found`), or `executor.ready_state.not_shown` when the
   * node's ready state was judged and not met, and nothing was dispatched.
   */
  skipped?:
    | { reason: "target_absent"; code: string }
    /**
     * The step could not run and the page matched another node's recorded
     * pre-state, so the run continued at `toNodeId` (`state-routing/`). The
     * attempt then reads `route: "state_routed"`, with no `failure`, `fault`
     * or `message`. `forward` is a page already past the step; `backward` a
     * page that has gone back.
     */
    | { reason: "state_routed"; code: string; toNodeId: string; direction: AutomationStudioStateRouteDirection };
  /**
   * What the run made of the page when this step could not run: whether it
   * read the page, how many nodes recorded a pre-state to compare, how many
   * matched, and where it went. Counts and closeness only: a route state or a
   * signature is never kept on a trace, as a Router keeps no observed value.
   * Absent when nothing judged the step unable to run, or when the Flow
   * declared the way on itself. A step whose readiness gate did not hold and
   * that was then dispatched anyway keeps the record of that consultation.
   */
  stateRouting?: AutomationStudioStateRoutingRecord;
  /**
   * Which attempt of this node this is, and why it was attempted again. Present
   * from the second attempt onwards, so a trace says plainly that the ladder,
   * not the Flow, put the node back on the page.
   */
  retry?: {
    attemptNumber: number;
    maxAttempts: number;
    /** The wait actually taken before this attempt. */
    backoffMs: number;
    /** The ladder rung that asked for this attempt. */
    rung: AutomationStudioLadderRungKind;
    previousAttemptId: string;
    /** The wait the failing source itself asked for, when it asked for one. */
    hintedWaitMs?: number;
    /** How much of that hint had already passed when the failed attempt settled and the wait began (`defensive/credited-hint.ts`). */
    creditedMs?: number;
  };
  /**
   * The pace this node's start was held to (`pacing/pace-keeper.ts`):
   * `inForceMs` the least time between two starts of it in this run, and
   * `waitedMs` what holding to it cost before this start. `raisedToMs` is set
   * on an attempt whose failure carried a wait hint: the pace the run holds
   * the node to from then on.
   */
  pace?: { inForceMs: number; waitedMs: number; raisedToMs?: number };
  /**
   * A timed pause the node asked for -- a Wait node answers `waiting` with its
   * `durationMs` -- and the run took before going on (`pacing/timed-pause.ts`).
   * `bounded` is set when the run's own limits cut it short.
   */
  pause?: { requestedMs: number; waitedMs: number; bounded?: true };
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
    /**
     * Set when the question was the person-needed one (`control.kind`
     * `person_check`): only a person could get past what the step met. A
     * resumed run reads it to end with a person-needed ending, and the run
     * counts it to stop asking the same person forever.
     */
    personNeeded?: true;
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

/**
 * One node's pace over a run: the least time between two successive starts of
 * it. `authoredMs` is the node's own `metadata.paceMs`; `learnedMs` is present
 * once a failure's wait hint raised the pace past it, `raisedCount` times;
 * `waitedMs` is what holding to the pace cost the run in total.
 */
export type AutomationStudioNodePace = {
  nodeId: string;
  paceMs: number;
  authoredMs?: number;
  learnedMs?: number;
  raisedCount: number;
  waitedMs: number;
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
  /**
   * What this run survived: every fault the default defensive policy assessed,
   * absorbed or refused, with what absorbing it cost in waiting.
   *
   * Absent when the run met no fault at all. It is here rather than only on the
   * attempts because a person reading a run needs to see at a glance that it was
   * attempted three times and waited four seconds, without reconstructing that
   * from a list of attempt records.
   */
  defence?: AutomationStudioDefenceSummary;
  /**
   * Every node this run held to a pace: authored on the node
   * (`metadata.paceMs`) or learned from a failure's wait hint. Absent when no
   * node was paced. A learned pace is what a promotion writes back to the
   * saved Flow, so playback starts paced.
   */
  pace?: AutomationStudioNodePace[];
  /** Present only on a partial run that ended at its stop node (`AutomationStudioGraphExecutionOptions.stopAfterNodeId`). */
  stopReason?: AutomationStudioGraphRunStopReason;
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
  /**
   * The record output's `process` declaration, copied as parsed: how the run's
   * collected rows become the dataset's answer when the run ends. Absent is the
   * default processing.
   */
  process?: AutomationStudioRecordProcessing;
};

export type AutomationStudioGraphExecutionOptions = {
  commandRun?: import("./command-scope/index.ts").AutomationStudioExecutorCommandRun;
  startNodeId?: string;
  /**
   * A partial run: the node after which the run ends `succeeded` with
   * `stopReason: "stopped_at_node"`, once that node has run and its outcome is
   * recorded, without leaving it by any way -- an edge, a failed route, a
   * continuation, or a forward state route. A state route that would take the
   * run past it stops the run as well; one back to an earlier step is followed.
   * Root graph only, like `startNodeId`: a Call Flow child never receives it.
   */
  stopAfterNodeId?: string;
  /** Attempts the run kept before this execution (a repair's re-run, same run id); ids are numbered after them so none repeats, as the store drops a repeated id. */
  priorAttemptCount?: number;
  inputs?: Record<string, JsonValue>;
  /**
   * The defaults the Flow's declared interface gives its inputs, when the caller
   * filled `inputs` from them. An input still equal to its declared default is
   * authored -- the published Flow holds it -- so the saved trace withholds it at
   * its own position but not by value (`trace-withholding.ts`, `supply`).
   */
  declaredInputDefaults?: Record<string, JsonValue>;
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
  effectDispatcher?: (effect: { type: string; payload?: JsonValue }, context?: { signal?: AbortSignal; withheldValues?: FluxIQRuntimeWithheldValues; commandContext?: import("../../../../client-gateway/service/command-ledger/index.ts").ClientGatewayCommandContext }) => Promise<AutomationNodeExecutionResult | undefined> | AutomationNodeExecutionResult | undefined;
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
  /**
   * Executes explicitly bound importer or trusted-local Code Node implementations.
   * `declaredOutputs` is the bound definition's output ports: a route the node's
   * dispatch answers is taken only when they declare it a branch (`node-execution.ts`).
   */
  nativeNodeExecutor?: (request: { node: AutomationStudioFlowNode; inputs: Record<string, JsonValue>; signal?: AbortSignal; hostContext?: { currentStateRef?: AutomationStudioHostStateSnapshotRef; previousStateRef?: AutomationStudioHostStateSnapshotRef; capabilityIds: string[]; sideEffectClass: "none" | "internal" | "external" | "destructive"; target?: JsonValue } }) => Promise<{ result: AutomationNodeExecutionResult; logs?: AutomationStudioNativeLogEntry[]; declaredOutputs?: readonly AutomationNodePort[] } | undefined>;
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
  /**
   * Where a person pauses, takes over and resumes this run. The executor asks
   * it once per step, before it executes a node, so a run is only ever held
   * between two steps and never in the middle of one. Unbound, a run cannot be
   * paused.
   */
  runControl?: AutomationStudioRunControlGate;
};

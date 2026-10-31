import type { AutomationStudioRunDatasetSummary } from "@fluxiq/contracts/automation-studio";
import type { JsonValue } from "../../../../../core/index.ts";
import type { AutomationStudioFlowNode } from "../../../model/index.ts";
import type { AutomationNodeExecutionResult, AutomationNodePort, AutomationStudioNativeLogEntry, AutomationStudioResolvedActionEffect } from "../../../nodes/index.ts";
import type { FluxIQRuntimeWithheldValues } from "../../../../../runtime/index.ts";
import type { AutomationStudioHostRuntimeBoundary, AutomationStudioHostStateSnapshotRef } from "../../host-runtime.ts";
import type { AutomationStudioParkingPort } from "../../parking/index.ts";
import type { AutomationStudioRunControlGate } from "../../run-control/index.ts";
import type { AutomationStudioRecoveryBudget, AutomationStudioGraphExecutionTrace, AutomationStudioRecordBatch } from "../contracts.ts";

export type AutomationStudioGraphExecutionOptions = {
  commandRun?: import("../command-scope/index.ts").AutomationStudioExecutorCommandRun;
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
  /** Fixed epoch milliseconds for relative task dates; live timing still uses now(). */
  referenceNow?: number;
  /** Trusted client floor from the canonical registry; raw unresolved parameter slots must not be dropped. */
  resolveActionEffect?: (node: AutomationStudioFlowNode, parameterValues?: Readonly<Record<string, unknown>>) => AutomationStudioResolvedActionEffect | undefined;
  signal?: AbortSignal;
  /**
   * How the run waits between retry attempts. A real timer by default; a test
   * or a simulator supplies its own so a backoff costs no wall clock.
   */
  delay?: (ms: number, signal?: AbortSignal) => Promise<void>;
  /** The region timeout's timer, `ClientGatewayTimerSource`-shaped: real `setTimeout` when absent, as before; an offline environment's virtual timers (P4 "Virtual clock", `./region-execution.ts`). */
  startTimer?: (wait: { readonly kind: "region_timeout" }, delayMs: number, fire: () => void) => { cancel(): void };
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
  effectDispatcher?: (effect: { type: string; payload?: JsonValue }, context?: { signal?: AbortSignal; referenceNow?: number; withheldValues?: FluxIQRuntimeWithheldValues; commandContext?: import("../../../../../client-gateway/service/command-ledger/index.ts").ClientGatewayCommandContext }) => Promise<AutomationNodeExecutionResult | undefined> | AutomationNodeExecutionResult | undefined;
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
  nativeNodeExecutor?: (request: { node: AutomationStudioFlowNode; inputs: Record<string, JsonValue>; signal?: AbortSignal; hostContext?: { referenceNow?: number; currentStateRef?: AutomationStudioHostStateSnapshotRef; previousStateRef?: AutomationStudioHostStateSnapshotRef; capabilityIds: string[]; sideEffectClass: "none" | "internal" | "external" | "destructive"; target?: JsonValue } }) => Promise<{ result: AutomationNodeExecutionResult; logs?: AutomationStudioNativeLogEntry[]; declaredOutputs?: readonly AutomationNodePort[] } | undefined>;
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
  /** The frame this graph run executes as, and the run-level frame holder it shares (C1). */
  invocation?: import("../frames/index.ts").AutomationStudioInvocationOptions;
  /** The sibling Subflow graphs of the run's automation, for Call Subflow and automation-scope handlers (C1, C4). */
  subflowGraphs?: import("../frames/index.ts").AutomationStudioSubflowGraphSource;
  /**
   * In-run model repair (C6 step 8): asked once per incident, on a true failure
   * only, while the run holds in place. Supplied by the run session on an
   * adapting run; absent, a true failure ends the run as it always has.
   */
  repairIncident?: import("../lifecycle-run/index.ts").AutomationStudioIncidentRepairCallback;
  /**
   * Learning a layer the client's defence closed while a step succeeded, as a
   * handler of the Flow (t516, `step-loop/incident-repair.ts`). Supplied by the
   * run session on a run that keeps what it learns; absent, nothing is asked.
   */
  learnInterruption?: import("../lifecycle-run/index.ts").AutomationStudioInterruptionLearningCallback;
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

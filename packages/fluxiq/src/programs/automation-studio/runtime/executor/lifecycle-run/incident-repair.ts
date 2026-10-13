// In-run model repair at the failing step (state-aware recovery plan, C6 step 8,
// C12 "Unit repair, in the run first"): the contract between the executor,
// which holds the run in place on a true failure, and the run session, which
// asks the model for a fix to one unit and overlays it on the Flow in memory.
//
// The executor never reads a model's words: it hands the session the incident
// and the unit, and gets back a graph to run on, already overlaid and checked
// (`live-patch/overlay.ts`), or the reason there is none.
import type { AutomationStudioFlowDocument } from "../../../model/index.ts";
import type { AutomationStudioClearedLayer, AutomationStudioNodeAttemptTrace } from "../contracts.ts";
import type { AutomationStudioRecoveryIncident } from "../lifecycle/index.ts";

/**
 * The smallest unit a true failure names: the node that failed, the handler
 * whose body failed or whose completion check stayed untrue, or the part
 * (a called Subflow) whose success check or contract it broke.
 */
export type AutomationStudioRepairUnit =
  | { kind: "node"; nodeId: string }
  | { kind: "handler"; handlerNodeId: string }
  | { kind: "part"; subflowId: string };

/** What the executor hands the run session when a true failure reaches step 8. */
export type AutomationStudioIncidentRepairRequest = {
  incident: AutomationStudioRecoveryIncident;
  unit: AutomationStudioRepairUnit;
  /** The graph of the frame the unit belongs to, as this run executes it (earlier overlays included). */
  graph: AutomationStudioFlowDocument;
  subflowId: string | null;
  /** The invocation ids of the frames the failure happened in, outermost first. */
  framePath: readonly string[];
  /** The attempt whose failure made the incident true. */
  failedAttempt: AutomationStudioNodeAttemptTrace;
  /** Every attempt of the run so far: the recoveries already tried and the acts already completed. */
  attempts: readonly AutomationStudioNodeAttemptTrace[];
  signal?: AbortSignal;
};

/**
 * The run session's answer: a graph to carry on with, the unit's fix already
 * overlaid on it, or why there is none (no repair for this run, the cost
 * ceiling, a model that offered nothing, an overlay the guard refused).
 * `partGraph` is set when the fix replaced a called part's graph.
 *
 * How the executor uses an overlay (`../step-loop/incident-repair.ts`):
 * - `graph` replaces the failing frame's graph for the rest of that frame
 *   (node lookup, edges and handler registration all read it). It must still
 *   hold the failing node, by the same id: that node is attempted again from
 *   the saved continuation (same loop pass and row, values and variables
 *   kept), with a fresh retry floor, and that attempt is the fix's trial.
 * - `partGraph` is what a Call Subflow to `subflowId` runs from then on in
 *   this run, wherever it is called (the run holder's `subflowOverrides`).
 * - `reason`, optional, says in plain words what the fix changed; the
 *   attempt's `repair` record carries it.
 * - A trial that ends in a true failure of the same incident drops the
 *   overlay (both graphs are restored) and ends the run failed; the callback
 *   is never asked twice for one incident.
 */
export type AutomationStudioIncidentRepair =
  | {
    kind: "overlay";
    repairId: string;
    unit: AutomationStudioRepairUnit;
    graph: AutomationStudioFlowDocument;
    partGraph?: { subflowId: string; graph: AutomationStudioFlowDocument };
    reason?: string;
  }
  | { kind: "none"; reason: string };

/**
 * Supplied by the run session on an adapting run that can hold in place;
 * absent, a true failure ends the run as before. Asked at most once per
 * incident, never inside a handler body, never past an uncertain act or a
 * Core stop (cancel, pause, permission, Outcome uncertain), and never once the
 * run's signal has aborted. A throw reads as `none`.
 */
export type AutomationStudioIncidentRepairCallback = (request: AutomationStudioIncidentRepairRequest) => Promise<AutomationStudioIncidentRepair>;

/**
 * What the executor hands the run session when a step succeeded and the
 * client's defence closed a layer over the page on the way (t516): the user's
 * rule is that an interruption met in a run becomes a branch of the Flow. The
 * session may answer with the frame's graph carrying a handler for that layer
 * (an overlay, as a repair's), or `none`. Asked at most once per step and
 * layer name in a run, never inside a handler body, and only for a layer that
 * has a name and a way out the domain can press (`wayOut`,
 * `wayOutDefinitionId`).
 */
export type AutomationStudioInterruptionLearningRequest = {
  /** The graph of the frame the step ran in, as this run executes it. */
  graph: AutomationStudioFlowDocument;
  subflowId: string | null;
  /** The invocation ids of the frames the step ran in, outermost first. */
  framePath: readonly string[];
  /** The step's succeeded attempt. */
  attempt: AutomationStudioNodeAttemptTrace;
  /** The closed layer to learn, as the attempt carries it. */
  layer: AutomationStudioClearedLayer;
  signal?: AbortSignal;
};

/** Supplied by the run session on a run that keeps what it learns; absent, a closed layer is only recorded on the attempt. A throw reads as `none`. */
export type AutomationStudioInterruptionLearningCallback = (request: AutomationStudioInterruptionLearningRequest) => Promise<AutomationStudioIncidentRepair>;

/**
 * What the run keeps of one incident's repair (`run-state.ts`, `repairs`):
 * the attempt record, and the part whose graph the run holder overrides, so a
 * drop can take that override back.
 */
export type AutomationStudioRunRepair = {
  repairId?: string;
  unit: AutomationStudioRepairUnit;
  outcome: "held" | "dropped" | "none";
  reason: string;
  partSubflowId?: string;
};

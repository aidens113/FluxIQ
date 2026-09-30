// The shapes run control shares across its directory: what a person can ask of
// a live run, what the run reports back, and the gate the executor waits at.
//
// Nothing here imports the executor. The executor imports the gate type from
// this directory, so the dependency runs one way: run control knows nothing of
// graphs, nodes or traces, only of "a place between two steps".

/**
 * Where a live run stands with respect to a person.
 *
 * - `running`: FluxIQ is driving and nothing is asked of it.
 * - `pause_requested`: a pause was asked while a step was in flight. The step
 *   finishes -- a click is never cut in half -- and the run holds at the next
 *   checkpoint.
 * - `paused`: the run is held between two steps. Nothing is dispatched to the
 *   page until it is resumed or stopped.
 */
export type AutomationStudioRunControlState = "running" | "pause_requested" | "paused";

/**
 * Who has the page while a run is held. `fluxiq` is a plain pause: the person
 * asked the run to wait. `person` is a takeover: the person is acting on the
 * page, and FluxIQ must not touch it until control is returned.
 */
export type AutomationStudioRunControlHolder = "fluxiq" | "person";

/** What the run is doing while it runs, as far as a person needs to know. */
export type AutomationStudioRunControlPhase = "executing" | "adapting";

/** One thing that happened to a run's control, in order. Kept for the run's record. */
export type AutomationStudioRunControlEvent =
  | { kind: "pause_requested"; at: number; holder: AutomationStudioRunControlHolder; reason?: string }
  | { kind: "paused"; at: number; holder: AutomationStudioRunControlHolder; nodeId: string; step: number }
  | { kind: "resumed"; at: number; nodeId?: string; afterManualAction: boolean; note?: string }
  | { kind: "expired"; at: number; nodeId: string; pausedMs: number }
  | { kind: "stopped_while_paused"; at: number; nodeId: string };

/**
 * A live run's control, as any surface reads it. `nodeId` and `step` name the
 * node the run is held *before*: it has not executed on this arrival, and it is
 * the first thing the run does when it resumes.
 */
export type AutomationStudioRunControlSnapshot = {
  projectId: string;
  runId: string;
  state: AutomationStudioRunControlState;
  holder: AutomationStudioRunControlHolder | null;
  phase: AutomationStudioRunControlPhase;
  /** Set while paused: the node the run will execute first when it resumes. */
  nodeId?: string;
  step?: number;
  requestedAt?: number;
  pausedAt?: number;
  /** When a held run stops itself rather than holding its browser and admission forever. */
  expiresAt?: number;
  reason?: string;
  /** The last node the run reached, paused or not. */
  lastNodeId?: string;
  history: AutomationStudioRunControlEvent[];
};

/** Where the executor is when it asks whether it may go on. */
export type AutomationStudioRunCheckpoint = {
  nodeId: string;
  step: number;
};

/**
 * How a held run was let go. `resume` goes on from the node it held before;
 * `stop` ends the run as cancelled with `message` -- a run stopped while held,
 * or one held past its limit.
 */
export type AutomationStudioRunCheckpointOutcome =
  | { outcome: "resume"; afterManualAction: boolean }
  | { outcome: "stop"; message: string };

/**
 * The seam the executor waits at, once per step, before it executes a node.
 *
 * `checkpoint` returns `null` synchronously when the run may go straight on, so
 * an unpaused run pays no await and no scheduling change. Otherwise it returns
 * a promise that settles when the run is let go, and never rejects.
 */
export type AutomationStudioRunControlGate = {
  checkpoint(at: AutomationStudioRunCheckpoint): Promise<AutomationStudioRunCheckpointOutcome> | null;
};

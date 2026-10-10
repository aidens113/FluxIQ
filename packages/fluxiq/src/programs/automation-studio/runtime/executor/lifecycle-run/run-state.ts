// The run-level lifecycle state (state-aware recovery plan, C4, C7).
//
// This module owns the one mutable record of a run's lifecycle dispatch: the
// registration cache, the budget ledger, the open incidents and the counters
// that number handler executions. It hangs on the frame run holder
// (`../frames/run-holder.ts`), so every frame of a run -- a Call Subflow child,
// a Call Flow child, a handler body -- reads and spends the same one, and
// entering or leaving a Subflow resets nothing.

import type { JsonValue } from "../../../../../core/index.ts";
import type { AutomationStudioFlowArtifact, AutomationStudioFlowDocument, AutomationStudioFlowRunHandlerExecutionRecord } from "../../../model/index.ts";
import type { AutomationStudioIncidentEnding, AutomationStudioNodeAttemptTrace } from "../contracts.ts";
import {
  AUTOMATION_STUDIO_EMPTY_LIFECYCLE_LEDGER,
  type AutomationStudioLifecycleLedger,
  type AutomationStudioLifecycleBudget,
  type AutomationStudioRecoveryIncident,
  type AutomationStudioHandlerRegistration
} from "../lifecycle/index.ts";
import type { AutomationStudioRunRepair } from "./incident-repair.ts";

/**
 * A graph whose registrations a run may dispatch: a frame's own graph, or the
 * automation's `recovery`-role Subflow graph. `subflowId` is `null` for a root
 * graph that is no Subflow (a Call Flow child, a run without Subflows).
 */
export type AutomationStudioLifecycleGraph = {
  subflowId: string | null;
  graph: AutomationStudioFlowDocument;
  graphRevision: number | null;
  artifact?: AutomationStudioFlowArtifact;
};

/** One graph as the registry caches it: read into registrations once per run. */
export type AutomationStudioRegisteredLifecycleGraph = AutomationStudioLifecycleGraph & {
  registrations: readonly AutomationStudioHandlerRegistration[];
  /** Each Handler that could not be read and was left out (`../lifecycle/graph-registrations.ts`). */
  problems: readonly string[];
};

/**
 * One incident as the run keeps it: the record C7 defines, with how it ended
 * once something settled it and how many retries it spent (absent until the
 * first), which the run's counts read (`../step-loop/lifecycle-trace.ts`).
 */
export type AutomationStudioRunIncident = AutomationStudioRecoveryIncident & {
  ending?: AutomationStudioIncidentEnding;
  retries?: number;
};

/**
 * What one executing frame's step loop shows the rest of the run: its graph,
 * its attempts and its values, held by reference. A route from a frame it
 * called reads them to judge the path in this frame (C5) and whether the
 * checkpoint's `requires` are bound here.
 */
export type AutomationStudioLifecycleFrameView = {
  flow: AutomationStudioFlowDocument;
  attempts: readonly AutomationStudioNodeAttemptTrace[];
  values: Readonly<Record<string, JsonValue>>;
};

/**
 * The last handler that ran for one incident, and whether it failed: its body
 * failed, or its completion check was not `true`. An in-run repair of that
 * incident names the handler as its unit when it failed (C6 step 8).
 */
export type AutomationStudioIncidentHandlerRun = {
  handlerId: string;
  graphFlowId: string;
  handlerNodeId: string;
  failed: boolean;
};

/**
 * One run's lifecycle state.
 *
 * - `graphs`: each graph read so far, by its graph Flow id. A graph stays cached
 *   when its frame ends; only the graphs of frames still on the stack are
 *   offered to scope resolution (`./registry.ts`).
 * - `recovery`: the automation's recovery Subflow graph, loaded at most once.
 *   `loaded: false` until the first dispatch that has handler candidates asks.
 * - `budget`: fixed at the first dispatch from that run's recovery settings.
 * - `ledger`: what the run has spent (`../lifecycle/budget-ledger.ts`).
 * - `incidents`: every incident the run opened, by id; `openByArrival` maps a
 *   node arrival key to the incident open there.
 * - `problems`: what the dispatcher could not read or load, said once each.
 * - `executions`: every `handler_execution` record of the run, in the order
 *   the handlers ran or were refused, whichever frame they fired in. The root
 *   frame's trace carries them (`../graph-run.ts`).
 * - `carried`: a child frame's unresolved incident, keyed by its parent's
 *   invocation id and Call Subflow node id (`<invocationId>/<nodeId>`), taken
 *   once by that node's failure in the parent (C6 step 7).
 * - `frames`: each executing frame's view, by invocation id, from the moment
 *   its step loop starts until its run ends.
 * - `handlerRuns`: the last handler that ran for each incident, by incident id.
 * - `repairs`: each incident's in-run repair (C6 step 8), by incident id; one
 *   per incident, so a second true failure never asks again.
 */
export type AutomationStudioLifecycleRunState = {
  graphs: Map<string, AutomationStudioRegisteredLifecycleGraph>;
  recovery: { loaded: boolean; graph?: AutomationStudioRegisteredLifecycleGraph };
  budget?: AutomationStudioLifecycleBudget;
  ledger: AutomationStudioLifecycleLedger;
  incidents: Map<string, AutomationStudioRunIncident>;
  openByArrival: Map<string, string>;
  problems: string[];
  executions: AutomationStudioFlowRunHandlerExecutionRecord[];
  carried: Map<string, string>;
  frames: Map<string, AutomationStudioLifecycleFrameView>;
  handlerRuns: Map<string, AutomationStudioIncidentHandlerRun>;
  repairs: Map<string, AutomationStudioRunRepair>;
  /** Issues the next id of the named kind within the run: `incident-1`, `handler-execution-1`, ... */
  nextId(kind: "incident" | "handler-execution"): string;
};

/** A run's lifecycle state with nothing read, spent or opened. */
export function automationStudioLifecycleRunState(): AutomationStudioLifecycleRunState {
  const issued = { incident: 0, "handler-execution": 0 };
  return {
    graphs: new Map(),
    recovery: { loaded: false },
    ledger: AUTOMATION_STUDIO_EMPTY_LIFECYCLE_LEDGER,
    incidents: new Map(),
    openByArrival: new Map(),
    problems: [],
    executions: [],
    carried: new Map(),
    frames: new Map(),
    handlerRuns: new Map(),
    repairs: new Map(),
    nextId: (kind) => `${kind}-${(issued[kind] += 1)}`
  };
}

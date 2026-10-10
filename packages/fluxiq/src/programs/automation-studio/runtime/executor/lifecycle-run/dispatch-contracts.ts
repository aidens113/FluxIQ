// What the lifecycle dispatcher is asked and what it answers (state-aware
// recovery plan, C3-C5, C7, C11). The dispatcher itself is `./dispatch.ts`.

import type { ClientGatewayActivityRecovery } from "@fluxiq/contracts/client-gateway";
import type { JsonObject, JsonValue } from "../../../../../core/index.ts";
import type { AutomationStudioFlowRunHandlerExecutionRecord } from "../../../model/index.ts";
import type { AutomationStudioLifecycleEvent } from "../../../nodes/control-flow/index.ts";
import type { AutomationStudioGraphExecutionOptions, AutomationStudioGraphExecutionTrace, AutomationStudioLifecycleTrace } from "../contracts.ts";
import type {
  AutomationStudioLastingActStatus,
  AutomationStudioCoreStop,
  AutomationStudioDispositionDecision,
  AutomationStudioFactTruth,
  AutomationStudioHandlerRegistration,
  AutomationStudioHandlerSource,
  AutomationStudioHandlerLevel
} from "../lifecycle/index.ts";
import type { AutomationStudioLifecycleGraph } from "./run-state.ts";

/** A checkpoint a `route` disposition named, found in the current frame or one that called it. */
export type AutomationStudioLifecycleRouteTarget = {
  checkpointId: string;
  invocationId: string;
  graphFlowId: string;
  nodeId: string;
};

/**
 * What graph-run knows about a route that the dispatcher cannot: whether it
 * would move past a node whose lasting act is `uncertain`, whether it
 * re-enters a path that would repeat a completed `reconcile` act, and that
 * act's effect check when one was asked (`../lifecycle/dispositions.ts`).
 * `unreachable` says why the step loop could not move to the target at all
 * (its node is not in the frame's graph as it runs), which refuses the route
 * as not found, before any budget is spent or any row says it succeeded.
 */
export type AutomationStudioLifecycleRouteGuard = (target: AutomationStudioLifecycleRouteTarget) => {
  unreachable?: string;
  passesUncertainAct: boolean;
  repeatsCompletedReconcile: boolean;
  effectCheck?: "landed" | "not_landed" | "unknown";
};

/**
 * One lifecycle event at one node of the frame executing now (the last frame
 * on `options.invocation.run.stack`).
 *
 * - `graph`: the graph that frame runs; registered on first sight.
 * - `arrival`: which arrival at `nodeId` this is in that frame (1 for the
 *   first), so the same interruption met again later is a new occurrence.
 * - `attemptNumber`, `outputsSoFar`, `lastingActStatus`: the continuation (C5).
 * - `values`: the run values at the boundary. A body is handed them as its
 *   inputs, and a condition's `{ value }` reads them; `{ input }` reads the
 *   frame's inputs.
 * - `incidentId`: the incident open at this node, at `retry` and `fail`.
 * - `requiredOutputIds`: what a `resolve` must cover at `fail`.
 * - `remainingSteps`: what is left of the run's `maxSteps`, which body steps
 *   count against.
 * - `coreStop`: a Core stop already standing, which no handler overrides.
 * - `routeGuard`: without one, a `route` is never taken.
 * - `priorAttemptCount`: how many attempts the run already numbered, so a
 *   body's attempt ids number after them and never repeat one.
 */
export type AutomationStudioLifecycleDispatchInput = {
  event: AutomationStudioLifecycleEvent;
  nodeId: string;
  graph: AutomationStudioLifecycleGraph;
  options: AutomationStudioGraphExecutionOptions;
  arrival: number;
  attemptNumber: number;
  values: Readonly<Record<string, JsonValue>>;
  attemptId?: string;
  outputsSoFar?: JsonObject;
  lastingActStatus?: AutomationStudioLastingActStatus;
  incidentId?: string;
  requiredOutputIds?: readonly string[];
  remainingSteps?: number;
  coreStop?: AutomationStudioCoreStop;
  routeGuard?: AutomationStudioLifecycleRouteGuard;
  priorAttemptCount?: number;
};

/**
 * One handler the dispatcher ran, or refused before running.
 *
 * - `selection`: why this handler, in plain words: its level, and what nearer
 *   or earlier candidates did.
 * - `decision`: what the run does next, after the dispatcher's rules.
 * - `lifecycle`: the attempt's `lifecycle` record; absent on a refusal, when
 *   no handler ran.
 * - `execution`: the `handler_execution` record for the runtime stream.
 * - `recovery`: the activity `recovery` detail, already emitted.
 * - `bodyTrace`: the body's saved trace, when the body ran; `bodySteps` its
 *   steps, which count against the run's `maxSteps`.
 * - `readyState`: the node's ready state re-observed after the body, when it
 *   is written as fact conditions (an expectation-form ready state is checked
 *   by the readiness gate, which runs after `before` dispatch anyway).
 */
export type AutomationStudioLifecycleHandlerRun = {
  handlerId: string;
  level: AutomationStudioHandlerLevel;
  selection: string;
  occurrence: string;
  decision: AutomationStudioDispositionDecision;
  lifecycle?: AutomationStudioLifecycleTrace;
  execution: AutomationStudioFlowRunHandlerExecutionRecord;
  recovery: ClientGatewayActivityRecovery;
  bodyTrace?: AutomationStudioGraphExecutionTrace;
  bodySteps: number;
  readyState?: AutomationStudioFactTruth;
  routeTarget?: AutomationStudioLifecycleRouteTarget;
};

/**
 * What the dispatcher decided. `observations` counts host fact calls.
 *
 * - `none`: no handler applied. With no Handler-node candidate in scope it
 *   made no fact call at all; graph-run carries on exactly as before.
 * - `authored`: the first applicable candidate is an authored path (a
 *   `failed` edge, an optional way on, a clears-interference node), which
 *   graph-run runs with today's ladder code. `runs` holds any handler that ran
 *   and ended `unhandled` before it.
 * - `handled`: one or more handlers ran or were refused. `decision` is what
 *   the run does next: at `before`, `resume` when any handler resumed and none
 *   routed or stopped; elsewhere the first decisive one, else the last
 *   `unhandled`. `routeTarget` is set with a `route` decision.
 */
export type AutomationStudioLifecycleDispatchOutcome =
  | { kind: "none"; observations: number; runs: AutomationStudioLifecycleHandlerRun[] }
  | {
    kind: "authored";
    source: Exclude<AutomationStudioHandlerSource, { kind: "handler_node" }>;
    registration: AutomationStudioHandlerRegistration;
    level: AutomationStudioHandlerLevel;
    observations: number;
    runs: AutomationStudioLifecycleHandlerRun[];
  }
  | {
    kind: "handled";
    decision: AutomationStudioDispositionDecision;
    routeTarget?: AutomationStudioLifecycleRouteTarget;
    observations: number;
    runs: AutomationStudioLifecycleHandlerRun[];
  };

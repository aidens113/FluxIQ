import type { JsonObject } from "../../../../../core/index.ts";
import type { AutomationStudioFlowNode } from "../../../model/index.ts";
import type { AutomationStudioLifecycleEvent } from "../../../nodes/control-flow/index.ts";
import type { AutomationStudioGraphExecutionTrace, AutomationStudioLifecycleTrace } from "../contracts.ts";
import type { AutomationStudioFramePhase, AutomationStudioInvocationOptions } from "../frames/index.ts";
import { automationStudioLifecycleEventApplies, type AutomationStudioDispositionDecision, type AutomationStudioLastingActStatus } from "../lifecycle/index.ts";
import {
  automationStudioLifecycleHasHandlers,
  automationStudioRegisterLifecycleGraph,
  dispatchAutomationStudioLifecycleEvent,
  type AutomationStudioLifecycleDispatchOutcome,
  type AutomationStudioLifecycleHandlerRun,
  type AutomationStudioLifecycleRouteTarget
} from "../lifecycle-run/index.ts";
import { automationStudioEndedTrace } from "./ended-trace.ts";
import { automationStudioStepLifecycleRouteGuard } from "./lifecycle-route-guard.ts";
import { automationStudioStepRouteLeavesLoops } from "./checkpoint-route.ts";
import { automationStudioOutcomeUncertainTrace } from "./uncertain-stop.ts";
import type { AutomationStudioStepLoopContext } from "./loop-context.ts";

/** The frame phase each event's boundary stands at (`../frames/invocation-frame.ts`). */
const EVENT_PHASE: Readonly<Record<AutomationStudioLifecycleEvent, AutomationStudioFramePhase>> = Object.freeze({
  start: "before_attempt",
  before: "before_attempt",
  retry: "before_retry",
  fail: "failed",
  before_next: "before_next"
});

/**
 * What a lifecycle boundary comes to in the step loop (C5):
 *
 * - `pass`: no handler applied, an authored path is first (a `failed` edge, an
 *   optional way on, a clears-interference node), or every handler ended
 *   `unhandled`: the step loop goes on exactly as it did before handlers;
 * - `resume`: a handler cleared the way; the saved attempt goes on;
 * - `route`: a handler routed to a checkpoint in this frame, at `node`;
 * - `resolve`: an On Fail handler supplied `outputs`; the run takes `success`;
 * - `return`: a Core stop ended the run with `trace`, or a handler routed to a
 *   checkpoint in a calling frame, and this frame ends with `trace`, whose
 *   `checkpointRoute` its Call Subflow attempt carries up (`./checkpoint-route.ts`).
 *
 * `lifecycle` is the record of the last handler that ran, for the attempt.
 */
export type AutomationStudioStepLifecycleOutcome =
  | { kind: "pass"; lifecycle?: AutomationStudioLifecycleTrace }
  | { kind: "resume"; lifecycle?: AutomationStudioLifecycleTrace }
  | { kind: "route"; node: AutomationStudioFlowNode; lifecycle?: AutomationStudioLifecycleTrace }
  | { kind: "resolve"; outputs: JsonObject; lifecycle?: AutomationStudioLifecycleTrace }
  | { kind: "return"; trace: AutomationStudioGraphExecutionTrace; lifecycle?: AutomationStudioLifecycleTrace };

/** One boundary at one node of this frame, and what the continuation saves (C5). */
export type AutomationStudioStepLifecycleBoundary = {
  event: AutomationStudioLifecycleEvent;
  node: AutomationStudioFlowNode;
  attemptNumber: number;
  attemptId?: string;
  outputsSoFar?: JsonObject;
  lastingActStatus?: AutomationStudioLastingActStatus;
  incidentId?: string;
  requiredOutputIds?: readonly string[];
};

/**
 * Registers this frame's graph with the run's handler registry when the frame
 * starts, so an ancestor's inherited handlers are known before a child
 * dispatches (C4), shows the run this frame's graph, attempts and values, so a
 * route from a frame it calls can judge the path here (C5), and stands the
 * frame's cursor at its first node.
 */
export function automationStudioStepLifecycleRegister(ctx: AutomationStudioStepLoopContext, nodeId: string): void {
  const invocation = ctx.options.invocation;
  if (!invocation) return;
  automationStudioRegisterLifecycleGraph(invocation.run.lifecycle, frameGraph(ctx, invocation));
  invocation.run.lifecycle.frames.set(invocation.frame.invocationId, { flow: ctx.flow, attempts: ctx.attempts, values: ctx.values });
  standCursor(invocation, nodeId, "before_attempt");
}

/**
 * Dispatches one lifecycle event at one node of this frame and turns what the
 * dispatcher decided into what the step loop does next. A run with no Handler
 * in scope pays nothing past the first dispatch, which loads the recovery
 * Subflow once: it answers `pass` without asking the dispatcher, and so
 * without a fact call.
 *
 * Each handler body's steps count against the run's steps, and its attempts
 * are kept for this frame's trace. A route to a checkpoint in a calling frame
 * ends this frame so that frame continues there: the dispatcher judged its
 * `when`, `requires` and path, and charged it, once.
 */
export async function automationStudioStepLifecycle(ctx: AutomationStudioStepLoopContext, boundary: AutomationStudioStepLifecycleBoundary): Promise<AutomationStudioStepLifecycleOutcome> {
  const invocation = ctx.options.invocation;
  if (!invocation) return { kind: "pass" };
  const { event, node } = boundary;
  standCursor(invocation, node.id, EVENT_PHASE[event]);
  // Core plumbing neither acts on nor reads the host, so no handler fires at it (`../lifecycle/event-applies.ts`).
  if (!automationStudioLifecycleEventApplies(event, node)) return { kind: "pass" };
  const run = invocation.run;
  if (run.lifecycle.recovery.loaded && !automationStudioLifecycleHasHandlers(run)) return { kind: "pass" };
  const outcome = await dispatchAutomationStudioLifecycleEvent({
    event,
    nodeId: node.id,
    graph: frameGraph(ctx, invocation),
    options: ctx.options,
    arrival: ctx.arrival.ordinal,
    attemptNumber: boundary.attemptNumber,
    values: ctx.values,
    ...(boundary.attemptId ? { attemptId: boundary.attemptId } : {}),
    ...(boundary.outputsSoFar ? { outputsSoFar: boundary.outputsSoFar } : {}),
    ...(boundary.lastingActStatus ? { lastingActStatus: boundary.lastingActStatus } : {}),
    ...(boundary.incidentId ? { incidentId: boundary.incidentId } : {}),
    ...(boundary.requiredOutputIds ? { requiredOutputIds: boundary.requiredOutputIds } : {}),
    remainingSteps: Math.max(1, ctx.maxSteps - ctx.step),
    priorAttemptCount: (ctx.options.priorAttemptCount ?? 0) + ctx.attempts.length + ctx.lifecycle.bodyAttempts,
    routeGuard: automationStudioStepLifecycleRouteGuard(ctx, node.id)
  });
  for (const handled of outcome.runs) keepBody(ctx, handled);
  return applyOutcome(ctx, invocation, boundary, outcome);
}

function applyOutcome(
  ctx: AutomationStudioStepLoopContext,
  invocation: AutomationStudioInvocationOptions,
  boundary: AutomationStudioStepLifecycleBoundary,
  outcome: AutomationStudioLifecycleDispatchOutcome
): AutomationStudioStepLifecycleOutcome {
  const last = [...outcome.runs].reverse().find((handled) => handled.lifecycle);
  const lifecycle = last?.lifecycle;
  const withRecord = lifecycle ? { lifecycle } : {};
  if (outcome.kind !== "handled") return { kind: "pass", ...withRecord };
  const decision = outcome.decision;
  switch (decision.kind) {
    case "unhandled":
      return { kind: "pass", ...withRecord };
    case "resume":
      return { kind: "resume", ...withRecord };
    case "resolve":
      return { kind: "resolve", outputs: decision.outputs, ...withRecord };
    case "stop":
      return { kind: "return", trace: stopTrace(ctx, boundary.node.id, decision) };
    case "route":
      break;
  }
  const target = outcome.routeTarget;
  const routed = last ?? outcome.runs[outcome.runs.length - 1];
  // The dispatcher only decides a route the guard found reachable; this is the step loop's own last check.
  const own = target?.invocationId === invocation.frame.invocationId;
  const to = own ? ctx.nodesById.get(target.nodeId) : undefined;
  if (!target || (own && !to) || (!own && !invocation.run.stack.some((frame) => frame.invocationId === target.invocationId))) {
    note(invocation, `Checkpoint "${decision.checkpointId}" could not be reached from this frame, so the handler's route was treated as unhandled.`);
    if (routed) unroute(routed);
    return { kind: "pass", ...withRecord };
  }
  const incident = boundary.incidentId ? invocation.run.lifecycle.incidents.get(boundary.incidentId) : undefined;
  if (incident && routed) incident.routes.push({ checkpointId: decision.checkpointId, handlerId: routed.handlerId });
  if (!to) return { kind: "return", trace: routeOutTrace(ctx, boundary.node.id, target), ...withRecord };
  const stops = ctx.stopAfter?.stops({ fromNodeId: boundary.node.id, toNodeId: to.id });
  if (stops) return { kind: "return", trace: ctx.stoppedAt(boundary.node.id, stops) };
  automationStudioStepRouteLeavesLoops(ctx, boundary.node.id, to.id);
  return { kind: "route", node: to, ...withRecord };
}

/**
 * This frame's end for a route to a checkpoint in a frame that called it: it
 * ends where it is, unfinished, carrying the route up (`./checkpoint-route.ts`).
 */
function routeOutTrace(ctx: AutomationStudioStepLoopContext, nodeId: string, target: AutomationStudioLifecycleRouteTarget): AutomationStudioGraphExecutionTrace {
  const checkpointRoute = { checkpointId: target.checkpointId, invocationId: target.invocationId, graphFlowId: target.graphFlowId, nodeId: target.nodeId };
  return { ...automationStudioEndedTrace(ctx, "failed", nodeId, `Handed back to checkpoint "${target.checkpointId}" in a calling frame.`), checkpointRoute };
}

/** The run's end on a Core stop no handler overrides: a cancel ends it cancelled, an uncertain act and anything else end it failed. */
function stopTrace(ctx: AutomationStudioStepLoopContext, nodeId: string, decision: Extract<AutomationStudioDispositionDecision, { kind: "stop" }>): AutomationStudioGraphExecutionTrace {
  if (decision.stop === "cancel") return automationStudioEndedTrace(ctx, "cancelled", nodeId, "Run cancelled.");
  if (decision.stop === "outcome_uncertain") return automationStudioOutcomeUncertainTrace(ctx, nodeId, `Outcome uncertain: ${decision.reason}`);
  return automationStudioEndedTrace(ctx, "failed", nodeId, decision.reason);
}

/** A body's steps count against the run's, and its attempts go on this frame's trace where it ran. */
function keepBody(ctx: AutomationStudioStepLoopContext, handled: AutomationStudioLifecycleHandlerRun): void {
  ctx.maxSteps -= handled.bodySteps;
  const attempts = handled.bodyTrace?.attempts ?? [];
  if (!attempts.length) return;
  ctx.lifecycle.bodies.push({ at: ctx.attempts.length, attempts });
  ctx.lifecycle.bodyAttempts += attempts.length;
}

/** A route the step loop did not take reads `unhandled` on the attempt's record, refused as unreachable, and on the stream's. */
function unroute(handled: AutomationStudioLifecycleHandlerRun): void {
  handled.execution.disposition = { kind: "unhandled" };
  if (handled.lifecycle) handled.lifecycle.disposition = { kind: "unhandled", reason: "route_refused", guard: "unreachable" };
}

/** Said once on the run holder, which the root frame's trace carries (`./lifecycle-trace.ts`). */
function note(invocation: AutomationStudioInvocationOptions, text: string): void {
  const problems = invocation.run.lifecycle.problems;
  if (!problems.includes(text)) problems.push(text);
}

function frameGraph(ctx: AutomationStudioStepLoopContext, invocation: AutomationStudioInvocationOptions) {
  return { subflowId: invocation.frame.subflowId, graph: ctx.flow, graphRevision: invocation.frame.graphRevision };
}

/** Moves the frame's cursor; a handler frame's phase stays `handler`, which is what keeps handlers from nesting. */
function standCursor(invocation: AutomationStudioInvocationOptions, nodeId: string, phase: AutomationStudioFramePhase): void {
  const { frame } = invocation;
  frame.cursor = { nodeId, phase: frame.cursor.phase === "handler" ? "handler" : phase };
}

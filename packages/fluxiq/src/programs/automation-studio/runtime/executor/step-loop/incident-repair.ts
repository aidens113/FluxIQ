import type { AutomationStudioFlowDocument, AutomationStudioFlowNode } from "../../../model/index.ts";
import { AUTOMATION_STUDIO_CALL_SUBFLOW_DEFINITION_ID } from "../../../nodes/control-flow/index.ts";
import { emitAutomationStudioActivityThought } from "../../activity/index.ts";
import type { AutomationStudioAttemptRepairTrace, AutomationStudioLadderRungKind, AutomationStudioNodeAttemptTrace } from "../contracts.ts";
import type { AutomationStudioFaultAssessment } from "../defensive/index.ts";
import type { AutomationStudioInvocationOptions } from "../frames/index.ts";
import {
  automationStudioIncidentHandlerRetrial,
  type AutomationStudioIncidentRepair,
  type AutomationStudioIncidentRepairRequest,
  type AutomationStudioRepairUnit,
  type AutomationStudioRunRepair
} from "../lifecycle-run/index.ts";
import { automationStudioEndedTrace } from "./ended-trace.ts";
import { automationStudioStepLifecycleRegister } from "./lifecycle-dispatch.ts";
import type { AutomationStudioStepLoopContext } from "./loop-context.ts";
import type { AutomationStudioStepOutcome } from "./loop-outcome.ts";

/** Failure categories that are a permission gate: a fix to the Flow cannot grant what was refused. */
const PERMISSION_CATEGORIES: ReadonlySet<string> = new Set(["external_side_effect_denied", "blocked_by_capability_or_policy"]);

/** One true failure, where the step loop met it. */
type TrueFailure = {
  node: AutomationStudioFlowNode;
  attemptIndex: number;
  incidentId: string | undefined;
  fault: AutomationStudioFaultAssessment | undefined;
};

/**
 * In-run model repair at the failing step (state-aware recovery plan, C6 step
 * 8, C12 "Unit repair, in the run first"), called only on a true failure.
 *
 * The run does not return. It holds in place -- frames, values, variables,
 * loop positions, pace and the defence ledger stay as they are -- says "Fixing
 * a step", and asks `options.repairIncident` once for a fix to the incident's
 * smallest unit. An overlay replaces this frame's graph for the rest of the
 * frame (and a called part's graph for the rest of the run), and the failing
 * node is attempted again from where the run stood, at the same loop pass and
 * row, with a fresh retry floor: that attempt is the fix's trial. Answers:
 *
 * - `next`: the trial; the step loop moves to the node in the fixed graph.
 * - `return`: the run was cancelled while the fix was being made.
 * - nothing: the run ends failed as it did before, the reason on the attempt.
 *
 * A second true failure of the same incident asks nothing: a fix that was held
 * is dropped (both graphs put back) and the run ends. A run with no callback
 * never gets here past the first line, so its trace is unchanged.
 */
export async function automationStudioStepRepairIncident(
  ctx: AutomationStudioStepLoopContext,
  failure: TrueFailure
): Promise<Extract<AutomationStudioStepOutcome, { kind: "next" | "return" }> | undefined> {
  const { options } = ctx;
  const invocation = options.invocation;
  const incidentId = failure.incidentId;
  if (!options.repairIncident || !invocation || !incidentId) return undefined;
  const prior = invocation.run.lifecycle.repairs.get(incidentId);
  if (prior) {
    if (prior.outcome === "held") dropOverlay(ctx, invocation, failure, incidentId, prior);
    return undefined;
  }
  if (!automationStudioStepRepairWillAsk(ctx, failure)) return undefined;
  const failedAttempt = ctx.attempts[failure.attemptIndex]!;
  const unit = repairUnit(ctx, invocation, failure.node, failedAttempt, incidentId);
  emitAutomationStudioActivityThought({ phase: "repairing", title: "Fixing a step", text: "Nothing in the Flow could take the run past this step, so the run waits here while the step is fixed, then tries it again where it stood.", ref: failure.node.id });
  await options.commandRun?.checkpoint();
  const answer = await ask(ctx, invocation, { unit, failedAttempt, incidentId });
  await options.commandRun?.checkpoint();
  if (options.signal?.aborted) {
    record(ctx, invocation, failure, incidentId, { unit, outcome: "none", reason: "The run was cancelled while the step was being fixed." });
    return { kind: "return", trace: automationStudioEndedTrace(ctx, "cancelled", failure.node.id, "Run cancelled.") };
  }
  if (answer.kind === "none") {
    record(ctx, invocation, failure, incidentId, { unit, outcome: "none", reason: answer.reason });
    return undefined;
  }
  const reattempt = answer.graph.nodes.find((node) => node.id === failure.node.id);
  if (!reattempt) {
    record(ctx, invocation, failure, incidentId, { unit: answer.unit, outcome: "none", reason: `The fix left out ${failure.node.id}, the step it was to fix, so it was not used.` });
    return undefined;
  }
  return { kind: "next", node: holdOverlay(ctx, invocation, failure, incidentId, answer, reattempt) };
}

/**
 * Whether a true failure here will be held for an in-run fix: the run has a
 * fix to ask for, the incident was not fixed once already, and it may ask
 * (`mayAsk`). The recovery ladder's last words read it before the fix is
 * asked, so they say a fix comes only when one will (t428).
 */
export function automationStudioStepRepairWillAsk(ctx: AutomationStudioStepLoopContext, failure: TrueFailure): boolean {
  const invocation = ctx.options.invocation;
  if (!ctx.options.repairIncident || !invocation || !failure.incidentId) return false;
  if (invocation.run.lifecycle.repairs.has(failure.incidentId)) return false;
  return mayAsk(ctx, invocation, failure);
}

/**
 * Whether the run may ask at all: never inside a handler body (the handler is
 * the unit there), never once cancelled or paused, never on a permission gate,
 * and never past a lasting act whose outcome is uncertain anywhere in the run.
 */
function mayAsk(ctx: AutomationStudioStepLoopContext, invocation: AutomationStudioInvocationOptions, failure: TrueFailure): boolean {
  const { options } = ctx;
  if (options.signal?.aborted || options.runControl?.heldBy?.()) return false;
  if (invocation.run.stack.some((frame) => frame.cursor.phase === "handler")) return false;
  if (failure.fault?.actUncertain) return false;
  const category = failure.fault?.category ?? ctx.attempts[failure.attemptIndex]?.failure?.category;
  if (category && PERMISSION_CATEGORIES.has(category)) return false;
  return !runAttempts(ctx, invocation).some(endedUncertain);
}

/** An attempt whose lasting act's outcome stayed uncertain, here or in a frame it called. */
function endedUncertain(attempt: AutomationStudioNodeAttemptTrace): boolean {
  const uncertain = attempt.effectCheck ? attempt.effectCheck.result === "unknown" : attempt.status === "failed" && attempt.fault?.actUncertain === true;
  return uncertain || (attempt.childTrace?.attempts.some(endedUncertain) ?? false);
}

/**
 * The incident's smallest unit: the handler that ran for it and failed (its
 * body failed, or its completion check stayed untrue) when that handler is in
 * this frame's graph; the called part when a Call Subflow node failed because
 * its child's success check or contract broke; otherwise the node.
 */
function repairUnit(
  ctx: AutomationStudioStepLoopContext,
  invocation: AutomationStudioInvocationOptions,
  node: AutomationStudioFlowNode,
  attempt: AutomationStudioNodeAttemptTrace,
  incidentId: string
): AutomationStudioRepairUnit {
  const handler = invocation.run.lifecycle.handlerRuns.get(incidentId);
  if (handler?.failed && handler.graphFlowId === ctx.flow.flowId) return { kind: "handler", handlerNodeId: handler.handlerNodeId };
  const subflowId = attempt.subflowTarget?.subflowId;
  const partBroke = attempt.childTrace?.status === "failed" && attempt.childTrace.failure !== undefined;
  if (node.definitionId === AUTOMATION_STUDIO_CALL_SUBFLOW_DEFINITION_ID && subflowId && partBroke) return { kind: "part", subflowId };
  return { kind: "node", nodeId: node.id };
}

/** Asks the run session once; a throw is an answer of `none`. */
async function ask(
  ctx: AutomationStudioStepLoopContext,
  invocation: AutomationStudioInvocationOptions,
  asked: { unit: AutomationStudioRepairUnit; failedAttempt: AutomationStudioNodeAttemptTrace; incidentId: string }
): Promise<AutomationStudioIncidentRepair> {
  const { run, frame } = invocation;
  const at = run.stack.indexOf(frame);
  const request: AutomationStudioIncidentRepairRequest = {
    incident: run.lifecycle.incidents.get(asked.incidentId)!,
    unit: asked.unit,
    graph: ctx.flow,
    subflowId: frame.subflowId,
    framePath: (at >= 0 ? run.stack.slice(0, at + 1) : [frame]).map((held) => held.invocationId),
    failedAttempt: asked.failedAttempt,
    attempts: runAttempts(ctx, invocation),
    ...(ctx.options.signal ? { signal: ctx.options.signal } : {})
  };
  try {
    return await ctx.options.repairIncident!(request);
  } catch (error) {
    return { kind: "none", reason: `The fix could not be asked for: ${error instanceof Error ? error.message : String(error)}` };
  }
}

/** Every attempt of the run so far: each executing frame's, outermost first, this frame's last. */
function runAttempts(ctx: AutomationStudioStepLoopContext, invocation: AutomationStudioInvocationOptions): AutomationStudioNodeAttemptTrace[] {
  const { stack, lifecycle } = invocation.run;
  const outer = stack.filter((frame) => frame !== invocation.frame).flatMap((frame) => [...(lifecycle.frames.get(frame.invocationId)?.attempts ?? [])]);
  return [...outer, ...ctx.attempts];
}

/**
 * Overlays the fix and stands the run at the failing node again: the frame
 * runs the fixed graph from here, a fixed part is what its Subflow runs, a
 * fixed handler may run once more for this incident, and the arrival starts
 * over at the same arrival number, so the incident is the same one and the
 * trial gets the whole retry floor.
 */
function holdOverlay(
  ctx: AutomationStudioStepLoopContext,
  invocation: AutomationStudioInvocationOptions,
  failure: TrueFailure,
  incidentId: string,
  answer: Extract<AutomationStudioIncidentRepair, { kind: "overlay" }>,
  reattempt: AutomationStudioFlowNode
): AutomationStudioFlowNode {
  const { run } = invocation;
  if (!ctx.lifecycle.overlays.has(incidentId)) ctx.lifecycle.overlays.set(incidentId, ctx.flow);
  swapGraph(ctx, invocation, answer.graph, reattempt.id);
  if (answer.partGraph) run.subflowOverrides.set(answer.partGraph.subflowId, answer.partGraph.graph);
  if (answer.unit.kind === "handler") automationStudioIncidentHandlerRetrial(run, incidentId, `${answer.graph.flowId}/${answer.unit.handlerNodeId}`);
  const reason = answer.reason ?? `A fix to ${unitWords(answer.unit)} was applied to this run, and the step is tried again where the run stood.`;
  record(ctx, invocation, failure, incidentId, { repairId: answer.repairId, unit: answer.unit, outcome: "held", reason, ...(answer.partGraph ? { partSubflowId: answer.partGraph.subflowId } : {}) });
  // The trial decides how the incident ends, as a retry's next attempt does.
  const incident = run.lifecycle.incidents.get(incidentId);
  if (incident) delete incident.ending;
  ctx.arrival = { nodeId: reattempt.id, attempts: 0, consumed: new Set<AutomationStudioLadderRungKind>(), ordinal: ctx.arrival.ordinal };
  ctx.pendingRetry = undefined;
  ctx.runState.defence.leaveNode();
  return reattempt;
}

/** The trial ended in a true failure of the same incident: the frame's graph and any part's graph are put back. */
function dropOverlay(ctx: AutomationStudioStepLoopContext, invocation: AutomationStudioInvocationOptions, failure: TrueFailure, incidentId: string, prior: AutomationStudioRunRepair): void {
  const original = ctx.lifecycle.overlays.get(incidentId);
  if (original) swapGraph(ctx, invocation, original, failure.node.id);
  ctx.lifecycle.overlays.delete(incidentId);
  if (prior.partSubflowId) invocation.run.subflowOverrides.delete(prior.partSubflowId);
  const reason = "The fix was tried at the step and the step still failed, so the fix was dropped and the run ends here.";
  record(ctx, invocation, failure, incidentId, { ...prior, outcome: "dropped", reason });
}

/** This frame runs `graph` from now on: node lookup, edges and its handler registration all read it. */
function swapGraph(ctx: AutomationStudioStepLoopContext, invocation: AutomationStudioInvocationOptions, graph: AutomationStudioFlowDocument, nodeId: string): void {
  ctx.flow = graph;
  ctx.nodesById = new Map(graph.nodes.map((node) => [node.id, node]));
  invocation.frame.graphFlowId = graph.flowId;
  automationStudioStepLifecycleRegister(ctx, nodeId);
}

/** Keeps the incident's repair on the run and its record on the attempt. */
function record(ctx: AutomationStudioStepLoopContext, invocation: AutomationStudioInvocationOptions, failure: TrueFailure, incidentId: string, repair: AutomationStudioRunRepair): void {
  invocation.run.lifecycle.repairs.set(incidentId, repair);
  const trace: AutomationStudioAttemptRepairTrace = { ...(repair.repairId ? { repairId: repair.repairId } : {}), unit: repair.unit, outcome: repair.outcome, reason: repair.reason };
  ctx.attempts[failure.attemptIndex] = { ...ctx.attempts[failure.attemptIndex]!, repair: trace };
}

function unitWords(unit: AutomationStudioRepairUnit): string {
  if (unit.kind === "node") return `step ${unit.nodeId}`;
  if (unit.kind === "handler") return `the recovery step ${unit.handlerNodeId}`;
  return `the part ${unit.subflowId}`;
}

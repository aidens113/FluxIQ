import type { AutomationStudioFlowNode } from "../../../model/index.ts";
import { emitAutomationStudioActivityStepSkipped } from "../../activity/index.ts";
import type { AutomationStudioNodeAttemptTrace } from "../contracts.ts";
import { automationStudioNodeActLasts } from "../defensive/index.ts";
import { chooseAutomationStudioEdge, hasUnvisitedAutomationStudioNodes, missingTargetTrace } from "../graph-navigation.ts";
import { automationStudioCompletedActIdentity } from "../lifecycle-run/index.ts";
import { recordRegionTransition } from "../region-execution.ts";
import { automationStudioEndedTrace } from "./ended-trace.ts";
import type { AutomationStudioStepLoopContext } from "./loop-context.ts";
import type { AutomationStudioStepOutcome } from "./loop-outcome.ts";
import { automationStudioStepFrameSucceeded } from "./success-check.ts";

/** The closed code a skipped act's attempt carries. */
const ALREADY_DONE_CODE = "executor.act.already_done";

/**
 * A lasting act the run already completed is never dispatched again
 * (state-aware recovery plan, C5; supervisor decision, t411): the goal is that
 * a completed act is never repeated, not that the run never goes back.
 *
 * At each arrival at a node whose act lasts (`../defensive/lasting-act.ts`),
 * before its pace, its On Before handlers and its readiness gate, the act's
 * identity is taken (`../lifecycle-run/act-identity.ts`): the row
 * it runs on, or its resolved target and inputs. When the run's completed-act
 * ledger holds it, the node is skipped as already done: its attempt reads
 * `succeeded` with `skipped: { reason: "already_done" }` and the outputs the
 * act produced the first time, the chat says "Already done for <row>", and
 * the run leaves by `success` (`next`). Otherwise the identity is kept for the
 * attempt about to run, which the ledger records once it is done
 * (`automationStudioStepRecordCompletedAct`, below), and the loop goes on
 * (`undefined`).
 *
 * A handler body's own acts are left alone: a body is recovery, and the same
 * dismissal may rightly run at each occurrence of what it clears.
 */
export async function automationStudioStepAlreadyDone(
  ctx: AutomationStudioStepLoopContext,
  node: AutomationStudioFlowNode,
  regionId: string | undefined
): Promise<Extract<AutomationStudioStepOutcome, { kind: "return" | "next" }> | undefined> {
  delete ctx.lifecycle.pendingAct;
  const invocation = ctx.options.invocation;
  if (!invocation || invocation.frame.cursor.phase === "handler" || !automationStudioNodeActLasts(node)) return undefined;
  const key = automationStudioCompletedActIdentity({
    flow: ctx.flow,
    node,
    attempts: ctx.attempts,
    values: ctx.values,
    variables: ctx.runState.variables,
    runInputs: ctx.options.inputs ?? {},
    frameInputs: invocation.frame.inputs
  });
  const done = invocation.run.lifecycle.completedActs.get(key);
  if (!done) {
    ctx.lifecycle.pendingAct = { nodeId: node.id, key };
    return undefined;
  }
  const row = ctx.loopWords.passOf(node.id, ctx.attempts)?.row ?? done.row;
  const said = row ? `Already done for ${row}` : `Already done: ${node.label?.trim() || "this step"}`;
  const at = ctx.now();
  const attempt: AutomationStudioNodeAttemptTrace = {
    attemptId: `${node.id}.attempt.${ctx.nextAttemptNumber()}`,
    nodeId: node.id,
    definitionId: node.definitionId,
    startedAt: at,
    finishedAt: at,
    status: "succeeded",
    route: "success",
    inputs: {},
    outputs: { ...done.outputs },
    effects: [],
    message: `${said}: the act completed in this run (${done.attemptId}), so it was not done again.`,
    skipped: { reason: "already_done", code: ALREADY_DONE_CODE, attemptId: done.attemptId, ...(row ? { row } : {}) },
    ...(regionId ? { regionId } : {})
  };
  ctx.attempts.push(attempt);
  for (const [outputId, value] of Object.entries(attempt.outputs)) {
    ctx.values[`${node.id}.${outputId}`] = value;
    ctx.values[outputId] = value;
  }
  const index = ctx.stepNumbers.numberOf(node.id);
  // The row carries `skipped` (t416), so a client reads it from that field; its subject is the row's label, else the step's own.
  const subject = row ?? node.label?.trim();
  emitAutomationStudioActivityStepSkipped({
    nodeId: node.id,
    said,
    skipped: { reason: "already_done", ...(subject ? { subject } : {}) },
    ...(index !== undefined ? { step: { index, count: ctx.stepNumbers.count, nodeId: node.id, ...(node.label ? { label: node.label } : {}), ...(row ? { row } : {}) } } : {})
  });
  return await leave(ctx, node, regionId);
}

/**
 * Records the lasting act the attempt at `attemptIndex` completed in the run's
 * completed-act ledger (state-aware recovery plan, C5; t411), under the
 * identity taken when the node was arrived at (above). Done is an attempt
 * that succeeded and was not skipped, or a failed one the run settled as
 * done: its expected state already held, or its effect check said `landed`
 * (`stateHeld`). The first completion of an identity is the one kept.
 * A node whose act does not last took no identity, and records nothing.
 */
export function automationStudioStepRecordCompletedAct(ctx: AutomationStudioStepLoopContext, node: AutomationStudioFlowNode, attemptIndex: number): void {
  const pending = ctx.lifecycle.pendingAct;
  const attempt = ctx.attempts[attemptIndex];
  const run = ctx.options.invocation?.run;
  if (!pending || pending.nodeId !== node.id || !attempt || attempt.nodeId !== node.id || !run) return;
  const done = (attempt.status === "succeeded" && !attempt.skipped) || attempt.stateHeld !== undefined;
  if (!done) return;
  delete ctx.lifecycle.pendingAct;
  if (run.lifecycle.completedActs.has(pending.key)) return;
  const row = ctx.loopWords.passOf(node.id, ctx.attempts.slice(0, attemptIndex))?.row;
  run.lifecycle.completedActs.set(pending.key, { key: pending.key, nodeId: node.id, attemptId: attempt.attemptId, outputs: attempt.outputs, ...(row ? { row } : {}) });
}

/** The way out of a skipped node: its `success` edge, as the step loop would take it after a success. */
async function leave(ctx: AutomationStudioStepLoopContext, node: AutomationStudioFlowNode, regionId: string | undefined): Promise<Extract<AutomationStudioStepOutcome, { kind: "return" | "next" }>> {
  const edge = chooseAutomationStudioEdge(ctx.flow, node.id, "success", node.definitionId);
  if (!edge) {
    const stops = ctx.stopAfter?.stops({ fromNodeId: node.id, toNodeId: node.id });
    if (stops) return { kind: "return", trace: ctx.stoppedAt(node.id, stops) };
    if (!hasUnvisitedAutomationStudioNodes(ctx.flow, ctx.attempts)) return { kind: "return", trace: await automationStudioStepFrameSucceeded(ctx, node.id) };
    return { kind: "return", trace: automationStudioEndedTrace(ctx, "failed", node.id, `Node ${node.id} was already done and has no success edge to continue by.`) };
  }
  const stops = ctx.stopAfter?.stops({ fromNodeId: node.id, toNodeId: edge.targetNodeId });
  if (stops) return { kind: "return", trace: ctx.stoppedAt(node.id, stops) };
  const next = ctx.nodesById.get(edge.targetNodeId);
  if (!next) return { kind: "return", trace: missingTargetTrace(ctx.startedAt, ctx.now(), edge, ctx.attempts, ctx.values, ctx.effects) };
  recordRegionTransition(edge, regionId, ctx.options, ctx.regionTransitions, ctx.now());
  return { kind: "next", node: next };
}

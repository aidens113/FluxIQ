// A graph run's re-acquire of a stale target, at the arrival of the attempt it
// comes before (t786, design D2-D6, D8). `../step-loop/arrival.ts` asks it;
// `../graph-run.ts` stamps its record on the attempt that follows and, for an
// item found gone, takes its attempt in place of a dispatch.

import type { AutomationStudioFlowNode } from "../../../flows/executable/graph/index.ts";
import { emitAutomationStudioActivityStepReacquire } from "../../../runtime/activity/index.ts";
import type { AutomationStudioRunCheckpointRow } from "../../../runtime/automation-host/index.ts";
import type { AutomationStudioNodeAttemptTrace } from "../index.ts";
import type { AutomationStudioNodeRetryPolicy } from "../index.ts";
import type { AutomationStudioStepLoopContext } from "../step-loop/index.ts";
import { automationStudioReacquireBeforeAttempt } from "./before-attempt.ts";
import { automationStudioFrameCaller, automationStudioFrameHandedRow, automationStudioNoteFrameArrival } from "./frame-row.ts";
import type { AutomationStudioTargetReacquireRecord } from "../../../runtime/automation-host/contracts/index.ts";
import { automationStudioTargetGoneAttempt } from "./gone-attempt.ts";
import { automationStudioTargetLineage } from "./lineage.ts";
import { automationStudioCheckpointRow } from "./row-recheck.ts";
import { automationStudioReacquireFromSource } from "./reacquire-from-source.ts";
import { automationStudioStaleTargetFailure } from "./stale-failure.ts";
import { automationStudioUnboundReacquire } from "../unbound-reacquire/index.ts";

/** What a re-acquire came to: the record the next attempt carries, and the attempt that stands in for it when the item is gone. */
export type AutomationStudioStepReacquired = { record: AutomationStudioTargetReacquireRecord; gone?: AutomationStudioNodeAttemptTrace };

/**
 * Re-acquires `node`'s stale target when this arrival is the attempt a
 * re-acquire comes before (`automationStudioReacquireBeforeAttempt`), a retry
 * is about to happen, the attempt it retries lost its target without acting
 * (`automationStudioStaleTargetFailure`), and the node has lineage. Once per
 * arrival; nothing otherwise.
 *
 * It spends no attempt. Its outcomes:
 *
 * - `found`: a row is written to `item` and `<loop>.item` for the rest of the
 *   pass; a bound value is laid over the binding's run path for this node's
 *   remaining attempts (`ctx.arrival.overlay`, gone when the run leaves the
 *   node). The attempt then runs on the fresh target. Said as a recovery that
 *   succeeded.
 * - `gone`: the attempt is synthesized as `executor.target.gone`, nothing is
 *   dispatched, and the step takes its normal failure path. Said as a recovery
 *   that failed.
 * - `unmatched`, `unavailable`: the attempt runs on the binding it had, and
 *   nothing is said.
 *
 * A step of a part its caller handed a row to has its lineage in the caller's frame:
 * the same re-find, asked there (`./row-recheck.ts`), with the same outcomes.
 *
 * Every arrival passes here first, a call step's too, which is what lets a step inside
 * the call reach the frame that called it (`./frame-row.ts`).
 */
export async function automationStudioStepReacquire(
  ctx: AutomationStudioStepLoopContext,
  node: AutomationStudioFlowNode,
  retryPolicy: AutomationStudioNodeRetryPolicy
): Promise<AutomationStudioStepReacquired | undefined> {
  automationStudioNoteFrameArrival(ctx, node);
  const retried = ctx.pendingRetry ? attemptById(ctx.attempts, ctx.pendingRetry.previousAttemptId) : undefined;
  if (!retried || ctx.arrival.reacquired || ctx.arrival.attempts !== automationStudioReacquireBeforeAttempt(retryPolicy.maxAttempts)) return undefined;
  if (!automationStudioStaleTargetFailure(retried, { actCompleted: actCompleted(ctx, node) })) return undefined;
  const lineage = automationStudioTargetLineage(ctx.flow, node);
  const handed = !lineage && automationStudioFrameHandedRow(ctx) !== undefined;
  if (handed) {
    ctx.arrival.reacquired = true;
    return await acrossTheCall(ctx, node, retried.failure!);
  }
  if (!lineage && !ctx.options.hostRuntime?.reacquireUnboundTarget) return undefined;
  ctx.arrival.reacquired = true;
  if (!lineage) ctx.arrival.identityReacquired = true;
  const record = lineage ? await automationStudioReacquireFromSource(ctx, node, lineage, retried.failure!) : await automationStudioUnboundReacquire(ctx, node, retried);
  if (!lineage && (ctx.options.signal?.aborted || actCompleted(ctx, node))) {
    delete ctx.arrival.parameterOverlay;
    return undefined;
  }
  const source = lineage ? ctx.nodesById.get(lineage.sourceNodeId) : undefined;
  if (record.outcome === "found" || record.outcome === "gone") emitAutomationStudioActivityStepReacquire({ nodeId: node.id, outcome: record.outcome, sourceLabel: source?.label });
  if (record.outcome !== "gone") return { record };
  return { record, gone: automationStudioTargetGoneAttempt(node, `${node.id}.attempt.${ctx.nextAttemptNumber()}`, record.at) };
}

/** The re-find for a row handed across a call, as the record and the attempt an ordinary lineage's makes. */
async function acrossTheCall(ctx: AutomationStudioStepLoopContext, node: AutomationStudioFlowNode, failure: NonNullable<AutomationStudioNodeAttemptTrace["failure"]>): Promise<AutomationStudioStepReacquired> {
  const row: AutomationStudioRunCheckpointRow = await automationStudioCheckpointRow(ctx, node, failure);
  const caller = automationStudioFrameCaller(ctx);
  const at = ctx.now();
  const sourceNodeId = (caller ? automationStudioTargetLineage(caller.ctx.flow, caller.node)?.sourceNodeId : undefined) ?? caller?.node.id ?? node.id;
  const reason = "reason" in row ? { reason: row.reason } : {};
  const record: AutomationStudioTargetReacquireRecord = { sourceNodeId, kind: "row", outcome: row.outcome === "found" || row.outcome === "gone" || row.outcome === "unmatched" ? row.outcome : "unavailable", ...reason, at };
  if (record.outcome === "found" || record.outcome === "gone") emitAutomationStudioActivityStepReacquire({ nodeId: node.id, outcome: record.outcome, sourceLabel: caller?.node.label });
  return record.outcome === "gone" ? { record, gone: automationStudioTargetGoneAttempt(node, `${node.id}.attempt.${ctx.nextAttemptNumber()}`, at) } : { record };
}

/** Whether the run's completed-act ledger already holds the act this node is about to make. */
function actCompleted(ctx: AutomationStudioStepLoopContext, node: AutomationStudioFlowNode): boolean {
  const pending = ctx.lifecycle.pendingAct;
  if (!pending || pending.nodeId !== node.id) return false;
  return ctx.options.invocation?.run.lifecycle.completedActs.has(pending.key) === true;
}

/** The latest attempt with this id: a seam that restamps an attempt replaces it in place under the same id. */
function attemptById(attempts: readonly AutomationStudioNodeAttemptTrace[], attemptId: string | undefined): AutomationStudioNodeAttemptTrace | undefined {
  if (!attemptId) return undefined;
  for (let index = attempts.length - 1; index >= 0; index -= 1) {
    if (attempts[index]!.attemptId === attemptId) return attempts[index];
  }
  return undefined;
}

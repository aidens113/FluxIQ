// A graph run's re-acquire of a stale target, at the arrival of the attempt it
// comes before (t786, design D2-D6, D8). `../step-loop/arrival.ts` asks it;
// `../graph-run.ts` stamps its record on the attempt that follows and, for an
// item found gone, takes its attempt in place of a dispatch.

import type { AutomationStudioFlowNode } from "../../../model/index.ts";
import { emitAutomationStudioActivityStepReacquire } from "../../activity/index.ts";
import type { AutomationStudioNodeAttemptTrace } from "../contracts.ts";
import type { AutomationStudioNodeRetryPolicy } from "../retry-policy.ts";
import type { AutomationStudioStepLoopContext } from "../step-loop/index.ts";
import { automationStudioReacquireBeforeAttempt } from "./before-attempt.ts";
import { automationStudioReacquireBoundValue } from "./bound-value.ts";
import { automationStudioReacquireCandidates } from "./candidates.ts";
import type { AutomationStudioTargetLineage, AutomationStudioTargetReacquireRecord } from "./contracts.ts";
import { automationStudioTargetGoneAttempt } from "./gone-attempt.ts";
import { automationStudioReacquireHostAnswer } from "./host-answer.ts";
import { automationStudioTargetLineage } from "./lineage.ts";
import { automationStudioReacquireSourceReadOnly } from "./read-only-source.ts";
import { automationStudioReacquireSourcePlace } from "./source-place.ts";
import { automationStudioReacquireSourceRerun } from "./source-rerun.ts";
import { automationStudioStaleTargetFailure } from "./stale-failure.ts";

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
 */
export async function automationStudioStepReacquire(
  ctx: AutomationStudioStepLoopContext,
  node: AutomationStudioFlowNode,
  retryPolicy: AutomationStudioNodeRetryPolicy
): Promise<AutomationStudioStepReacquired | undefined> {
  const retried = ctx.pendingRetry ? attemptById(ctx.attempts, ctx.pendingRetry.previousAttemptId) : undefined;
  if (!retried || ctx.arrival.reacquired || ctx.arrival.attempts !== automationStudioReacquireBeforeAttempt(retryPolicy.maxAttempts)) return undefined;
  if (!automationStudioStaleTargetFailure(retried, { actCompleted: actCompleted(ctx, node) })) return undefined;
  const lineage = automationStudioTargetLineage(ctx.flow, node);
  if (!lineage) return undefined;
  ctx.arrival.reacquired = true;
  const record = await reacquire(ctx, node, lineage, retried);
  const source = ctx.nodesById.get(lineage.sourceNodeId);
  if (record.outcome === "found" || record.outcome === "gone") emitAutomationStudioActivityStepReacquire({ nodeId: node.id, outcome: record.outcome, sourceLabel: source?.label });
  if (record.outcome !== "gone") return { record };
  return { record, gone: automationStudioTargetGoneAttempt(node, `${node.id}.attempt.${ctx.nextAttemptNumber()}`, record.at) };
}

/** The re-run, the match and the rebinding; every way it can stop short is an `unavailable` or `unmatched` record. */
async function reacquire(
  ctx: AutomationStudioStepLoopContext,
  node: AutomationStudioFlowNode,
  lineage: AutomationStudioTargetLineage,
  retried: AutomationStudioNodeAttemptTrace
): Promise<AutomationStudioTargetReacquireRecord> {
  const { options, values } = ctx;
  const ended = (outcome: AutomationStudioTargetReacquireRecord["outcome"], reason?: string, returned?: boolean): AutomationStudioTargetReacquireRecord => ({
    sourceNodeId: lineage.sourceNodeId, kind: lineage.kind, outcome, ...(reason ? { reason } : {}), ...(returned ? { returned: true as const } : {}), at: ctx.now()
  });
  const source = ctx.nodesById.get(lineage.sourceNodeId);
  const host = options.hostRuntime;
  if (!source || !automationStudioReacquireSourceReadOnly(source, ctx.runState.actionEffects.get(source.id) ?? options.resolveActionEffect?.(source))) return ended("unavailable", "source_not_read_only");
  if (!host?.reacquireTarget) return ended("unavailable", "no_matcher");
  const bound = automationStudioReacquireBoundValue(ctx.flow, node, lineage, values);
  if (!bound) return ended("unavailable", "no_stale_value");
  const place = await automationStudioReacquireSourcePlace({ host, node, source, attempts: ctx.attempts, signal: options.signal });
  const returned = place === "returned";
  if (place === "unavailable") return ended("unavailable", "place_unreachable");
  const outputs = await automationStudioReacquireSourceRerun(ctx, source);
  if (!outputs) return ended("unavailable", "source_failed", returned);
  const candidates = automationStudioReacquireCandidates(lineage, outputs, bound.field);
  if (!candidates) return ended("unavailable", "no_candidates", returned);
  const answer = await automationStudioReacquireHostAnswer(host, {
    node, source, lineage, stale: bound.stale, candidates, failure: retried.failure!, ...(options.signal ? { signal: options.signal } : {})
  });
  if (answer.outcome === "unmatched") return ended("unmatched", answer.reason, returned);
  if (answer.outcome === "gone") return ended("gone", undefined, returned);
  if (lineage.kind === "row") {
    // The fresh row is the pass's row for the rest of the pass, and a row the run captured keeps its marker in the saved trace.
    const marker = ctx.runState.records.captured().get(bound.stale as object);
    if (marker && answer.value && typeof answer.value === "object") ctx.runState.records.include(new Map([[answer.value, marker]]));
    if (lineage.loopNodeId) values[`${lineage.loopNodeId}.item`] = answer.value;
    values.item = answer.value;
  } else if (bound.path) {
    ctx.arrival.overlay = { [bound.path]: answer.value };
  }
  return ended("found", undefined, returned);
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

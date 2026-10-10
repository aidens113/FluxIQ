import type { AutomationStudioFlowNode } from "../../../model/index.ts";
import type { AutomationStudioGraphExecutionOptions, AutomationStudioLadderRungKind, AutomationStudioNodeAttemptTrace } from "../contracts.ts";
import { automationStudioAwaitNodeReadiness, type AutomationStudioReadinessOutcome } from "../ladder-run.ts";
import { automationStudioRunWait } from "../pacing/index.ts";
import { automationStudioRecordedState, type AutomationStudioRecordedState } from "../recorded-state.ts";
import { automationStudioNodeRetryPolicy, type AutomationStudioNodeRetryPolicy } from "../retry-policy.ts";
import { automationStudioStepAlreadyDone } from "./already-done.ts";
import { automationStudioEndedTrace } from "./ended-trace.ts";
import { automationStudioStepLifecycle } from "./lifecycle-dispatch.ts";
import { automationStudioStepCloseArrivalIncident } from "./lifecycle-incident.ts";
import type { AutomationStudioStepLoopContext } from "./loop-context.ts";
import type { AutomationStudioStepOutcome } from "./loop-outcome.ts";

type Region = NonNullable<AutomationStudioGraphExecutionOptions["regionRuntime"]>["regions"][number];

/**
 * Arrives at a node for one attempt: the region's capability and timeout
 * checks, the arrival count, the completed-act ledger (C5, t411), the node's
 * pace, its On Before handlers (C3, C6 step 1) and its readiness gate, in
 * that order. What the attempt is stamped with comes back as `arrived`; a
 * region that cannot run the node, a Core stop a handler met, or a run
 * cancelled while it waited, ends the run; an On Before handler that routed to
 * a checkpoint moves it there (`next`), and so does a lasting act the run
 * already completed, which is skipped as already done (`./already-done.ts`).
 */
export async function automationStudioStepArrival(
  ctx: AutomationStudioStepLoopContext,
  node: AutomationStudioFlowNode,
  regionId: string | undefined,
  region: Region | undefined
): Promise<Extract<AutomationStudioStepOutcome, { kind: "return" | "next" }> | {
  kind: "arrived";
  remainingMs: number | undefined;
  retryPolicy: AutomationStudioNodeRetryPolicy;
  recordedState: AutomationStudioRecordedState;
  paced: AutomationStudioNodeAttemptTrace["pace"];
  readiness: AutomationStudioReadinessOutcome | undefined;
}> {
  const { options, runState, now } = ctx;
  if (regionId && !ctx.regionStartedAt.has(regionId)) ctx.regionStartedAt.set(regionId, now());
  const missingCapability = region?.requiredRuntimeCapabilities?.find((capability) => !ctx.capabilities.has(capability));
  if (missingCapability) return { kind: "return", trace: automationStudioEndedTrace(ctx, "failed", node.id, `Region ${regionId} requires runtime capability ${missingCapability}.`) };
  const elapsed = region?.timeoutMs === undefined ? 0 : now() - (ctx.regionStartedAt.get(regionId!) ?? now());
  if (region?.timeoutMs !== undefined && elapsed >= region.timeoutMs) return { kind: "return", trace: automationStudioEndedTrace(ctx, "failed", node.id, `Region ${regionId} exceeded its ${region.timeoutMs}ms timeout.`) };
  const remainingMs = region?.timeoutMs === undefined ? undefined : region.timeoutMs - elapsed;
  if (ctx.arrival.nodeId !== node.id) {
    // The run passed the node it leaves, so the incident open there is over (C7).
    automationStudioStepCloseArrivalIncident(ctx);
    const ordinal = (ctx.lifecycle.arrivals.get(node.id) ?? 0) + 1;
    ctx.lifecycle.arrivals.set(node.id, ordinal);
    ctx.arrival = { nodeId: node.id, attempts: 0, consumed: new Set<AutomationStudioLadderRungKind>(), ordinal };
    // A fresh arrival gets a fresh waiting allowance, the same way it gets the
    // whole ladder again. The whole-run allowance is not reset by anything.
    runState.defence.leaveNode();
  }
  ctx.arrival.attempts += 1;
  // A lasting act this run already completed is skipped as already done, never dispatched again.
  const alreadyDone = await automationStudioStepAlreadyDone(ctx, node, regionId);
  if (alreadyDone) return alreadyDone;
  const retryPolicy = automationStudioNodeRetryPolicy(ctx.flow, node, options);
  const recordedState = automationStudioRecordedState(node);
  // A node's pace holds each arrival at it, never a retry of one (`pacing/pace-keeper.ts`).
  const paced = ctx.arrival.attempts === 1 ? await runState.pace.before(node, now, (ms) => automationStudioRunWait(options, ms)) : undefined;
  // On Before, retries included, before the readiness gate; its record rides on the attempt it cleared the way for.
  const before = await automationStudioStepLifecycle(ctx, { event: "before", node, attemptNumber: ctx.arrival.attempts, attemptId: `${node.id}.attempt.${ctx.nextAttemptNumber()}` });
  if (before.kind === "return" || before.kind === "route") return before.kind === "return" ? before : { kind: "next", node: before.node };
  if (before.lifecycle) ctx.lifecycle.pending = before.lifecycle;
  // The wait ceiling, gated by the state the node expects to find. It never
  // fails the node: an unsatisfied gate is a mark on the attempt, because the
  // recording is evidence the action was possible at that point. A gate
  // that judged the state and found it not met asks state routing first,
  // and a way on skips the dispatch entirely (`state-routing/`).
  const readiness = await automationStudioAwaitNodeReadiness(node, options, `${node.id}.attempt.${ctx.nextAttemptNumber()}`);
  await options.commandRun?.checkpoint();
  if (options.signal?.aborted) {
    return { kind: "return", trace: automationStudioEndedTrace(ctx, "cancelled", node.id, "Run cancelled.") };
  }
  return { kind: "arrived", remainingMs, retryPolicy, recordedState, paced, readiness };
}

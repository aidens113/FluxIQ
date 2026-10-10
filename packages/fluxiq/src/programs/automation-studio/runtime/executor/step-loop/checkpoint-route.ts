import type { AutomationStudioFlowNode } from "../../../model/index.ts";
import { automationStudioActivityLoops } from "../../activity/loop/index.ts";
import { automationStudioEndedTrace } from "./ended-trace.ts";
import type { AutomationStudioStepLoopContext } from "./loop-context.ts";
import type { AutomationStudioStepOutcome } from "./loop-outcome.ts";

/**
 * A Call Subflow attempt whose child ended to hand the run back to a
 * checkpoint in a calling frame (state-aware recovery plan, C5). The child's
 * handler chose the route, and the dispatcher judged it -- the checkpoint's
 * `when` and `requires`, what the path in the frame that holds it would pass
 * -- and charged it once, before anything unwound. A route that leaves a list
 * loop forgets the loop's place (`automationStudioStepRouteLeavesLoops`, below).
 *
 * - The checkpoint is in this frame: the run moves to it (`next`), unless a
 *   partial run stops on the way (`return`).
 * - It is in a frame that called this one: this frame ends too, carrying the
 *   same route up (`return`), and its own Call Subflow attempt carries it on.
 *
 * Either way the attempt is stamped with the route it carried. `undefined`
 * when the attempt carries none, and the step loop goes on as before.
 */
export function automationStudioStepCheckpointRoute(
  ctx: AutomationStudioStepLoopContext,
  node: AutomationStudioFlowNode,
  attemptIndex: number
): Extract<AutomationStudioStepOutcome, { kind: "return" | "next" }> | undefined {
  const marker = ctx.attempts[attemptIndex]?.childTrace?.checkpointRoute;
  if (!marker) return undefined;
  ctx.attempts[attemptIndex] = { ...ctx.attempts[attemptIndex]!, checkpointRoute: marker };
  const here = ctx.options.invocation?.frame.invocationId;
  if (marker.invocationId !== here) {
    const handedBack = automationStudioEndedTrace(ctx, "failed", node.id, `Handed back to checkpoint "${marker.checkpointId}" in a calling frame.`);
    return { kind: "return", trace: { ...handedBack, checkpointRoute: marker } };
  }
  const to = ctx.nodesById.get(marker.nodeId);
  if (!to) return { kind: "return", trace: automationStudioEndedTrace(ctx, "failed", node.id, `Checkpoint "${marker.checkpointId}" names node ${marker.nodeId}, which this graph does not hold.`) };
  const stops = ctx.stopAfter?.stops({ fromNodeId: node.id, toNodeId: to.id });
  if (stops) return { kind: "return", trace: ctx.stoppedAt(node.id, stops) };
  automationStudioStepRouteLeavesLoops(ctx, node.id, to.id);
  return { kind: "next", node: to };
}

/** A list loop's head (`nodes/control-flow/for-each.ts`). */
const FOR_EACH = "builtin.control.for-each";

/**
 * A handler's route from `fromNodeId` to a checkpoint at `toNodeId` in this
 * frame (C5) that leaves a list loop -- the route starts in the loop's body
 * and the checkpoint is outside it -- forgets that loop's place, so the run
 * that reaches its For Each again begins the list afresh, from what it reads
 * then. Without this a route back to the list's checkpoint found the For Each
 * past the row it left, and that row was never done.
 *
 * The rows the loop already did are not done twice: each one's act is in the
 * run's completed-act ledger and is skipped as already done (`./already-done.ts`).
 * A do-while loop (`builtin.control.repeat`) keeps its count: it bounds the
 * loop, and each pass acts on what the page shows that pass.
 */
export function automationStudioStepRouteLeavesLoops(ctx: AutomationStudioStepLoopContext, fromNodeId: string, toNodeId: string): void {
  for (const loop of automationStudioActivityLoops(ctx.flow, FOR_EACH)) {
    if (!loop.members.has(fromNodeId) || loop.members.has(toNodeId) || loop.repeatId === toNodeId) continue;
    ctx.runState.loops.delete(loop.repeatId);
  }
}

import type { AutomationStudioFlowNode } from "../../../model/index.ts";
import { automationStudioEndedTrace } from "./ended-trace.ts";
import type { AutomationStudioStepLoopContext } from "./loop-context.ts";
import type { AutomationStudioStepOutcome } from "./loop-outcome.ts";

/**
 * A Call Subflow attempt whose child ended to hand the run back to a
 * checkpoint in a calling frame (state-aware recovery plan, C5). The child's
 * handler chose the route, and the dispatcher judged it -- the checkpoint's
 * `when` and `requires`, what the path in the frame that holds it would pass or
 * repeat -- and charged it once, before anything unwound.
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
  return { kind: "next", node: to };
}

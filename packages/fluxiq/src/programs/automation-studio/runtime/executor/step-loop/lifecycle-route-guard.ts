import type { AutomationStudioFlowDocument } from "../../../model/index.ts";
import type { AutomationStudioNodeAttemptTrace } from "../contracts.ts";
import type { AutomationStudioLifecycleRouteGuard } from "../lifecycle-run/index.ts";
import { automationStudioRepeatedLastingAct, automationStudioStateRouteSpan } from "../state-routing/index.ts";
import type { AutomationStudioStepLoopContext } from "./loop-context.ts";

/** One frame's path as the guard judges it: its graph, its attempts, where the run is in it, and where the route leads. */
type JudgedPath = { flow: AutomationStudioFlowDocument; attempts: readonly AutomationStudioNodeAttemptTrace[]; fromNodeId: string; toNodeId: string };

/**
 * What a handler's `route` would pass or repeat, which only the step loop
 * knows (state-aware recovery plan, C5): built from the same lasting-act checks
 * safe state routing uses, in the frame that holds the checkpoint.
 *
 * - `passesUncertainAct`: a node on the way from where that frame is to the
 *   checkpoint (that node included) last ended with a lasting act whose
 *   outcome is uncertain: stamped `actUncertain` where it was seen
 *   (`../defensive/assess.ts`), or settled `unknown` by its effect check (C6
 *   step 4), which is how an uncertainty the assessment derived from a
 *   record shows. For a checkpoint in a calling frame, the failing node in
 *   this frame counts too.
 * - `repeatsCompletedReconcile`: the checkpoint, or a node on the way back
 *   from it, completed a lasting act in this run
 *   (`../state-routing/repeated-act.ts`). Nothing observes the page here, so
 *   its effect check is `landed` only when the host finds the act's recorded
 *   effect with no observation to compare, and `unknown` otherwise: neither
 *   lets the route repeat it.
 * - `unreachable`: the checkpoint's node is not in that frame's graph as it
 *   runs, or that frame is not one the run is executing.
 *
 * Where a calling frame is: the Call Subflow node that started the frame just
 * below it on the stack. The judgement is made before anything unwinds.
 */
export function automationStudioStepLifecycleRouteGuard(ctx: AutomationStudioStepLoopContext, fromNodeId: string): AutomationStudioLifecycleRouteGuard {
  return (target) => {
    const invocation = ctx.options.invocation;
    const own = { flow: ctx.flow, attempts: ctx.attempts, fromNodeId, toNodeId: target.nodeId };
    if (!invocation || target.invocationId === invocation.frame.invocationId) return judge(ctx, own);
    const { stack, lifecycle } = invocation.run;
    const at = stack.findIndex((frame) => frame.invocationId === target.invocationId);
    const view = lifecycle.frames.get(target.invocationId);
    const callNodeId = stack[at + 1]?.callNodeId;
    if (at < 0 || !view || !callNodeId) return { unreachable: `Checkpoint "${target.checkpointId}" is not in a frame this run is executing.`, passesUncertainAct: false, repeatsCompletedReconcile: false };
    const judged = judge(ctx, { flow: view.flow, attempts: view.attempts, fromNodeId: callNodeId, toNodeId: target.nodeId });
    return { ...judged, passesUncertainAct: judged.passesUncertainAct || lastEndedUncertain(ctx.attempts, fromNodeId) };
  };
}

function judge(ctx: AutomationStudioStepLoopContext, path: JudgedPath): ReturnType<AutomationStudioLifecycleRouteGuard> {
  if (!path.flow.nodes.some((node) => node.id === path.toNodeId)) {
    return { unreachable: `Node ${path.toNodeId} is not in the graph this frame runs.`, passesUncertainAct: false, repeatsCompletedReconcile: false };
  }
  const passed = automationStudioStateRouteSpan(path.flow, path.fromNodeId, path.toNodeId);
  passed.add(path.fromNodeId);
  passed.delete(path.toNodeId);
  const passesUncertainAct = [...passed].some((nodeId) => lastEndedUncertain(path.attempts, nodeId));
  const repeated = automationStudioRepeatedLastingAct({ flow: path.flow, fromNodeId: path.fromNodeId, toNodeId: path.toNodeId, attempts: path.attempts, hostRuntime: ctx.options.hostRuntime, observed: {} });
  if (!repeated) return { passesUncertainAct, repeatsCompletedReconcile: false };
  return { passesUncertainAct, repeatsCompletedReconcile: true, effectCheck: repeated.effect === "on_page" ? "landed" : "unknown" };
}

/** Whether the node's latest attempt in these attempts failed on a lasting act whose outcome is uncertain, or whose effect check could not tell. */
function lastEndedUncertain(attempts: readonly AutomationStudioNodeAttemptTrace[], nodeId: string): boolean {
  for (let index = attempts.length - 1; index >= 0; index -= 1) {
    const attempt = attempts[index]!;
    if (attempt.nodeId !== nodeId) continue;
    return attempt.status === "failed" && (attempt.fault?.actUncertain === true || attempt.effectCheck?.result === "unknown");
  }
  return false;
}

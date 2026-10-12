import type { AutomationStudioFlowDocument } from "../../../model/index.ts";
import type { AutomationStudioNodeAttemptTrace } from "../contracts.ts";
import { automationStudioNodeActLasts } from "../defensive/index.ts";
import type { AutomationStudioCompletedAct, AutomationStudioLifecycleRouteGuard } from "../lifecycle-run/index.ts";
import { automationStudioStateRouteSpan } from "../state-routing/index.ts";
import type { AutomationStudioStepLoopContext } from "./loop-context.ts";

/** One frame's path as the guard judges it: its graph, its attempts, where the run is in it, and where the route leads. */
type JudgedPath = { flow: AutomationStudioFlowDocument; attempts: readonly AutomationStudioNodeAttemptTrace[]; fromNodeId: string; toNodeId: string };

/**
 * What a handler's `route` would pass, which only the step loop
 * knows (state-aware recovery plan, C5): built from the same lasting-act checks
 * safe state routing uses, in the frame that holds the checkpoint.
 *
 * - `passesUncertainAct`: a node on the way from where that frame is to the
 *   checkpoint (that node included), or on the way back from the checkpoint
 *   to it (the checkpoint included), last ended with a lasting act whose
 *   outcome is uncertain: stamped `actUncertain` where it was seen
 *   (`../defensive/assess.ts`), or settled `unknown` by its effect check (C6
 *   step 4), which is how an uncertainty the assessment derived from a
 *   record shows. For a checkpoint in a calling frame, the failing node in
 *   this frame counts too.
 * - `unreachable`: the checkpoint's node is not in that frame's graph as it
 *   runs, or that frame is not one the run is executing.
 *
 * - `repeatsUnrecordedAct`: a node on the way back from the checkpoint (that
 *   node included) completed a lasting act in this run that the run's
 *   completed-act ledger does not hold -- a run resumed from a saved trace
 *   begins with an empty ledger -- so nothing would skip it.
 *
 * A route back past acts the ledger holds is not refused here: the ledger
 * skips each of them as already done when the run reaches it again
 * (`./already-done.ts`), so the run goes back without repeating one
 * (supervisor decision, t411; t404 row 10 could never take its `go to
 * requests` while this guard refused every route back past a completed act).
 *
 * Where a calling frame is: the Call Subflow node that started the frame just
 * below it on the stack. The judgement is made before anything unwinds.
 */
export function automationStudioStepLifecycleRouteGuard(ctx: AutomationStudioStepLoopContext, fromNodeId: string): AutomationStudioLifecycleRouteGuard {
  return (target) => {
    const invocation = ctx.options.invocation;
    const own = { flow: ctx.flow, attempts: ctx.attempts, fromNodeId, toNodeId: target.nodeId };
    const ledger = invocation?.run.lifecycle.completedActs ?? new Map<string, AutomationStudioCompletedAct>();
    if (!invocation || target.invocationId === invocation.frame.invocationId) return judge(own, ledger);
    const { stack, lifecycle } = invocation.run;
    const at = stack.findIndex((frame) => frame.invocationId === target.invocationId);
    const view = lifecycle.frames.get(target.invocationId);
    const callNodeId = stack[at + 1]?.callNodeId;
    if (at < 0 || !view || !callNodeId) return { unreachable: `Checkpoint "${target.checkpointId}" is not in a frame this run is executing.`, passesUncertainAct: false };
    const judged = judge({ flow: view.flow, attempts: view.attempts, fromNodeId: callNodeId, toNodeId: target.nodeId }, ledger);
    return { ...judged, passesUncertainAct: judged.passesUncertainAct || lastEndedUncertain(ctx.attempts, fromNodeId) };
  };
}

function judge(path: JudgedPath, ledger: ReadonlyMap<string, AutomationStudioCompletedAct>): ReturnType<AutomationStudioLifecycleRouteGuard> {
  if (!path.flow.nodes.some((node) => node.id === path.toNodeId)) {
    return { unreachable: `Node ${path.toNodeId} is not in the graph this frame runs.`, passesUncertainAct: false };
  }
  const passed = automationStudioStateRouteSpan(path.flow, path.fromNodeId, path.toNodeId);
  passed.add(path.fromNodeId);
  passed.delete(path.toNodeId);
  // A route back walks these again; an act among them that may have landed would be dispatched a second time (t411).
  const walkedAgain = automationStudioStateRouteSpan(path.flow, path.toNodeId, path.fromNodeId);
  walkedAgain.add(path.toNodeId);
  for (const nodeId of walkedAgain) passed.add(nodeId);
  const passesUncertainAct = [...passed].some((nodeId) => lastEndedUncertain(path.attempts, nodeId));
  walkedAgain.delete(path.fromNodeId);
  const ledgered = new Set([...ledger.keys()].map((key) => key.slice(0, key.lastIndexOf("/"))));
  const repeatsUnrecordedAct = path.flow.nodes.some((node) => walkedAgain.has(node.id) && automationStudioNodeActLasts(node) && completedIn(path.attempts, node.id) && !ledgered.has(`${path.flow.flowId}/${node.id}`));
  return { passesUncertainAct, ...(repeatsUnrecordedAct ? { repeatsUnrecordedAct } : {}) };
}

/** Whether the node completed an act in these attempts: succeeded and not skipped, or settled as done. */
function completedIn(attempts: readonly AutomationStudioNodeAttemptTrace[], nodeId: string): boolean {
  return attempts.some((attempt) => attempt.nodeId === nodeId && ((attempt.status === "succeeded" && !attempt.skipped) || attempt.stateHeld !== undefined));
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

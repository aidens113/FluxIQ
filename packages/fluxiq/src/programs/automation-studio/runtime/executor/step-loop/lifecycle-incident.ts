import type { AutomationStudioFlowNode } from "../../../model/index.ts";
import type { AutomationStudioGraphExecutionTrace, AutomationStudioNodeAttemptTrace } from "../contracts.ts";
import type { AutomationStudioInvocationOptions } from "../frames/index.ts";
import { automationStudioIncidentArrivalKey, closeAutomationStudioRecoveryIncident, openAutomationStudioRecoveryIncident } from "../lifecycle-run/index.ts";
import type { AutomationStudioStepLoopContext } from "./loop-context.ts";

/**
 * The recovery incident open at this node arrival of this frame (C7), opened
 * now when none is. The first permitted retry opens it, and a failure that
 * reaches On Fail without one opens it there. A Call Subflow node whose child
 * frame ended on an unresolved failure carries that child's incident, so the
 * handlers already tried for it are not run again here (C6 step 7).
 */
export function automationStudioStepOpenIncident(ctx: AutomationStudioStepLoopContext, node: AutomationStudioFlowNode, attempt: AutomationStudioNodeAttemptTrace): string | undefined {
  const invocation = ctx.options.invocation;
  if (!invocation) return undefined;
  const carried = invocation.run.lifecycle.carried;
  const carriedKey = `${invocation.frame.invocationId}/${node.id}`;
  const carriedIncidentId = carried.get(carriedKey);
  carried.delete(carriedKey);
  return openAutomationStudioRecoveryIncident(invocation.run, {
    invocationId: invocation.frame.invocationId,
    nodeId: node.id,
    arrival: ctx.arrival.ordinal,
    failureCode: attempt.failure?.code ?? "executor.attempt.failed",
    at: ctx.now(),
    ...(carriedIncidentId ? { carriedIncidentId } : {})
  }).incidentId;
}

/** Closes the incident open at the arrival the run is leaving: it passed the node. */
export function automationStudioStepCloseArrivalIncident(ctx: AutomationStudioStepLoopContext): void {
  const invocation = ctx.options.invocation;
  if (!invocation) return;
  const key = automationStudioIncidentArrivalKey({ invocationId: invocation.frame.invocationId, nodeId: ctx.arrival.nodeId, arrival: ctx.arrival.ordinal });
  const open = invocation.run.lifecycle.openByArrival.get(key);
  if (open) closeAutomationStudioRecoveryIncident(invocation.run, open);
}

/**
 * What the run keeps of this frame when its run ends: the frame's view
 * (`../lifecycle-run/run-state.ts`, `frames`) goes, and the incident still
 * open closes. A frame a Call Subflow node started that ends failed hands its
 * incident to that node in the parent first, where the node's own failure
 * takes it up -- unless it ended to hand the run back to a calling frame's
 * checkpoint, which settled the incident. A handler body's frame carries the
 * incident it was run for, which is its parent's to close: the body ending is
 * not the run passing the node. An incident nothing settled ends `passed` when
 * the frame succeeded and `ended` otherwise.
 */
export function automationStudioStepEndFrameIncident(invocation: AutomationStudioInvocationOptions | undefined, trace: Pick<AutomationStudioGraphExecutionTrace, "status" | "checkpointRoute">): void {
  if (invocation) invocation.run.lifecycle.frames.delete(invocation.frame.invocationId);
  const open = invocation?.frame.incidentId;
  if (!invocation || !open || invocation.frame.cursor.phase === "handler") return;
  const { frame, run } = invocation;
  const unresolved = trace.status === "failed" && !trace.checkpointRoute;
  if (unresolved && frame.parentInvocationId && frame.callNodeId) run.lifecycle.carried.set(`${frame.parentInvocationId}/${frame.callNodeId}`, open);
  closeAutomationStudioRecoveryIncident(run, open, trace.status === "succeeded" ? "passed" : "ended");
}

import type { AutomationStudioFlowDocument, AutomationStudioFlowNode } from "../../../model/index.ts";
import type { AutomationStudioFaultAssessment } from "../defensive/index.ts";
import { automationStudioStepLifecycle } from "./lifecycle-dispatch.ts";
import { automationStudioStepOpenIncident } from "./lifecycle-incident.ts";
import { automationStudioStepStampFailureClass, automationStudioStepStampLifecycle } from "./lifecycle-stamps.ts";
import type { AutomationStudioStepLoopContext } from "./loop-context.ts";
import type { AutomationStudioStepOutcome } from "./loop-outcome.ts";

/**
 * On Fail (C3, C6 step 6): the node's retries are spent or its failure is not
 * retryable, and no earlier rung moved the run on. The incident opens here if
 * no retry opened it -- carrying a child frame's incident into a Call Subflow
 * node -- and the On Fail handlers in scope are dispatched before the failed
 * route or the continuation is taken.
 *
 * - `pass`: no handler took the run on; the step loop goes on as it did before
 *   handlers, with the authored `failed` edge, the way on and the continuation.
 * - `proceed` down `success`: a handler resolved the failure; its outputs are
 *   the attempt's outputs and run values, as a success's are.
 * - `next`: a handler routed to a checkpoint in this frame.
 * - `return`: a Core stop ended the run, or a handler routed to a checkpoint
 *   in a calling frame and this frame ends to hand the run back there.
 *
 * An attempt whose lasting act may have landed dispatches nothing: no rung
 * below an uncertain act runs (C6 step 4), and the run stops as it always has.
 */
export async function automationStudioStepOnFail(
  ctx: AutomationStudioStepLoopContext,
  step: { node: AutomationStudioFlowNode; attemptIndex: number; fault: AutomationStudioFaultAssessment | undefined }
): Promise<{ kind: "pass"; incidentId: string | undefined } | Extract<AutomationStudioStepOutcome, { kind: "return" | "next" | "proceed" }>> {
  const { node, attemptIndex } = step;
  const attempt = ctx.attempts[attemptIndex]!;
  const incidentId = automationStudioStepOpenIncident(ctx, node, attempt);
  if (step.fault?.actUncertain) return { kind: "pass", incidentId };
  const onFail = await automationStudioStepLifecycle(ctx, {
    event: "fail",
    node,
    attemptNumber: ctx.arrival.attempts,
    attemptId: attempt.attemptId,
    outputsSoFar: attempt.outputs,
    lastingActStatus: "none",
    requiredOutputIds: automationStudioRequiredOutputIds(ctx.flow, node.id),
    ...(incidentId ? { incidentId } : {})
  });
  automationStudioStepStampLifecycle(ctx, attemptIndex, onFail.lifecycle);
  // A route to a calling frame's checkpoint ends this frame with it: a planned fail as well.
  const routedOut = onFail.kind === "return" && onFail.trace.checkpointRoute !== undefined;
  if (onFail.kind === "return" && !routedOut) return onFail;
  if (onFail.kind !== "resolve" && onFail.kind !== "route" && !routedOut) return { kind: "pass", incidentId };
  // A handler took the run on: a planned fail, never a model call.
  automationStudioStepStampFailureClass(ctx, attemptIndex, {
    uncertainAct: false,
    onFail: [{ kind: "handler", handlerId: onFail.lifecycle?.handlerId ?? "", when: "true", outcome: onFail.kind === "resolve" ? "resolve" : "route" }]
  }, incidentId);
  if (onFail.kind === "return") return onFail;
  if (onFail.kind === "route") return { kind: "next", node: onFail.node };
  for (const [key, value] of Object.entries(onFail.outputs)) {
    ctx.values[`${node.id}.${key}`] = value;
    ctx.values[key] = value;
  }
  ctx.attempts[attemptIndex] = { ...ctx.attempts[attemptIndex]!, outputs: { ...ctx.attempts[attemptIndex]!.outputs, ...onFail.outputs } };
  return { kind: "proceed", routeOverride: "success" };
}

/**
 * What a `resolve` at this node must supply, as the validator reads it at node
 * scope (`model/validation/flow.ts`): every output another node reads from it
 * over a data edge, and any the node lists in `metadata.requiredOutputs`.
 */
function automationStudioRequiredOutputIds(flow: AutomationStudioFlowDocument, nodeId: string): string[] {
  const required = new Set<string>();
  for (const edge of flow.edges) {
    if (edge.sourceNodeId !== nodeId || !edge.sourcePortId || !edge.targetPortId || edge.targetPortId === "in") continue;
    required.add(edge.sourcePortId);
  }
  const declared = flow.nodes.find((node) => node.id === nodeId)?.metadata?.requiredOutputs;
  if (Array.isArray(declared)) {
    for (const outputId of declared) if (typeof outputId === "string" && outputId) required.add(outputId);
  }
  return [...required];
}

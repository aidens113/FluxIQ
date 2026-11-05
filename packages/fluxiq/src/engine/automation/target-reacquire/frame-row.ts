// A row its caller handed a frame (`inputs: { item: <the pass's row> }` on a call step inside
// a repeat). The called part's steps are given that row as a loop's body steps are, so a
// press stays in it; and the step that read the list is in the frame that called this one,
// which is where the row has to be found again from.
//
// A frame is reached through the run's stack, by the node its caller is at. The caller is
// waiting on this frame, so what it holds is exactly as it was when it called, and nothing
// else is running in it. What a frame holds is not kept anywhere a run outlives: it goes
// with the frame object.

import type { JsonObject, JsonValue } from "../../../core/index.ts";
import type { AutomationStudioFlowNode } from "../../../flows/executable/graph/index.ts";
import type { AutomationStudioInvocationFrame } from "../frames/index.ts";
import type { AutomationStudioStepLoopContext } from "../step-loop/index.ts";

const ROW = "item";

export type AutomationStudioFrameStep = { ctx: AutomationStudioStepLoopContext; node: AutomationStudioFlowNode };

const ARRIVED = new WeakMap<AutomationStudioInvocationFrame, AutomationStudioFrameStep>();

/** Where a frame is now: read when a step inside a call it made needs its caller. */
export function automationStudioNoteFrameArrival(ctx: AutomationStudioStepLoopContext, node: AutomationStudioFlowNode): void {
  const frame = ctx.options.invocation?.frame;
  if (frame) ARRIVED.set(frame, { ctx, node });
}

/** The step that called this frame, in the frame that holds it; nothing for a root, or a frame whose caller cannot be reached. */
export function automationStudioFrameCaller(ctx: AutomationStudioStepLoopContext): AutomationStudioFrameStep | undefined {
  const invocation = ctx.options.invocation;
  const parentId = invocation?.frame.parentInvocationId;
  if (!invocation || !parentId) return undefined;
  const parent = invocation.run.stack.find((frame) => frame.invocationId === parentId);
  const step = parent ? ARRIVED.get(parent) : undefined;
  return step?.node.id === invocation.frame.callNodeId ? step : undefined;
}

/** The row this frame was handed, when it was handed one. */
export function automationStudioFrameHandedRow(ctx: AutomationStudioStepLoopContext): JsonObject | undefined {
  const invocation = ctx.options.invocation;
  return invocation?.frame.parentInvocationId ? rowOf(invocation.frame.inputs[ROW]) : undefined;
}

/** The row a call step's resolved parameters hand over. */
export function automationStudioRowAmongCallInputs(parameters: Readonly<Record<string, JsonValue>>): JsonObject | undefined {
  const inputs = parameters.inputs;
  return inputs && typeof inputs === "object" && !Array.isArray(inputs) ? rowOf(inputs[ROW]) : undefined;
}

/** The fresh row is this frame's row for the rest of the frame: what its steps read, what a press is scoped to, and what a trace withholds. */
export function automationStudioFrameRowIs(ctx: AutomationStudioStepLoopContext, fresh: JsonObject): void {
  ctx.withholding.supply({ [ROW]: fresh });
  ctx.values[ROW] = fresh;
  if (ctx.options.inputs) ctx.options.inputs[ROW] = fresh;
}

function rowOf(value: JsonValue | undefined): JsonObject | undefined {
  return value && typeof value === "object" && !Array.isArray(value) ? value : undefined;
}

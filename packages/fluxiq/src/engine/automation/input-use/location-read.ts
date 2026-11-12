import type { AutomationStudioInvocationOptions } from "../frames/index.ts";
import type { AutomationStudioInputUseRead } from "./read.ts";
import type { AutomationStudioInputUseLocation } from "./location.ts";
import { AutomationStudioInputUseCapture as Capture } from "./capture.ts";

/** Reads location without ever taking the frame's projected inputs as values. */
export class AutomationStudioInputUseLocationRead {
  static of(invocation: AutomationStudioInvocationOptions | undefined, graphFlowId?: string): AutomationStudioInputUseRead<AutomationStudioInputUseLocation> {
    if (!invocation || !invocation.run.stack.includes(invocation.frame)) return { status: "unknown", code: "unverified_frame" };
    return this.read(invocation, graphFlowId);
  }

  private static read(invocation: AutomationStudioInvocationOptions, graphFlowId?: string): AutomationStudioInputUseRead<AutomationStudioInputUseLocation> {
    const frame = invocation.frame;
    const location = Capture.object({ invocationId: frame.invocationId, graphFlowId: frame.graphFlowId, graphRevision: frame.graphRevision, subflowId: frame.subflowId,
      ...(frame.parentInvocationId !== undefined ? { parentInvocationId: frame.parentInvocationId } : {}), ...(frame.callNodeId !== undefined ? { callNodeId: frame.callNodeId } : {}) });
    if (location.status !== "valid" || graphFlowId !== undefined && frame.graphFlowId !== graphFlowId
      || !frame.invocationId || !frame.graphFlowId || frame.graphRevision !== null && (!Number.isSafeInteger(frame.graphRevision) || frame.graphRevision < 0)) return { status: "unknown", code: "unverified_frame" };
    return { status: "bound", value: location.value };
  }

  static child(parent: AutomationStudioInvocationOptions | undefined, child: AutomationStudioInvocationOptions | undefined): AutomationStudioInputUseRead<{ parent: AutomationStudioInputUseLocation; child: AutomationStudioInputUseLocation }> {
    if (!parent || !child || parent.run !== child.run) return { status: "unknown", code: "unverified_frame" };
    const from = this.of(parent);
    // The child has not entered its graph yet; reading its location must not push it onto the public stack.
    const to = this.read(child);
    if (from.status !== "bound" || to.status !== "bound" || to.value.parentInvocationId !== from.value.invocationId || !to.value.callNodeId) return { status: "unknown", code: "unverified_frame" };
    return { status: "bound", value: { parent: from.value, child: to.value } };
  }
}

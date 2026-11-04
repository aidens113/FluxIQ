// Invocation frames and the frame stack (state-aware recovery plan, C1).
export {
  AUTOMATION_STUDIO_FRAME_PHASES,
  type AutomationStudioFrameCursor,
  type AutomationStudioFrameEntry,
  type AutomationStudioFramePhase,
  type AutomationStudioInvocationFrame
} from "./invocation-frame.ts";
export type { AutomationStudioFramePath, AutomationStudioFrameStack } from "./stack.ts";
export type { AutomationStudioInvocationOptions, AutomationStudioPartPinRefusal, AutomationStudioRunFrames, AutomationStudioSubflowGraph, AutomationStudioSubflowGraphRunner, AutomationStudioSubflowGraphSource } from "./invocation-options.ts";
// A saved part a call step pins, and the id its frame runs under.
export { AUTOMATION_STUDIO_PART_CALL_MAX_DEPTH, automationStudioPartPinOf, automationStudioPinOfSubflowId, automationStudioPinnedSubflowId, type AutomationStudioPartPin } from "./part-pin.ts";
// The run holder, the root and child frames, and framing a graph run.
export { automationStudioRunFrames } from "./run-holder.ts";
export { automationStudioRootInvocation, runAutomationStudioGraphInFrame } from "./graph-frame.ts";
export { automationStudioChildInvocation } from "./child-frame.ts";
export { automationStudioTraceInFrame } from "./framed-trace.ts";
// Call Subflow: a sibling Subflow graph run as a frame of its own.
export { automationStudioCallSubflow, type AutomationStudioCalledSubflow } from "./call-subflow.ts";
// A declared output bound to a node key no node of the graph carries.
export { automationStudioLostOutputBinding, type AutomationStudioDeclaredOutputPort, type AutomationStudioLostOutputBinding } from "./lost-output-binding.ts";

// Invocation frames and the frame stack (state-aware recovery plan, C1).
export {
  AUTOMATION_STUDIO_FRAME_PHASES,
  type AutomationStudioFrameCursor,
  type AutomationStudioFrameEntry,
  type AutomationStudioFramePhase,
  type AutomationStudioInvocationFrame
} from "./invocation-frame.ts";
export type { AutomationStudioFramePath, AutomationStudioFrameStack } from "./stack.ts";
export type { AutomationStudioInvocationOptions, AutomationStudioRunFrames, AutomationStudioSubflowGraph, AutomationStudioSubflowGraphRunner, AutomationStudioSubflowGraphSource } from "./invocation-options.ts";
// The run holder, the root and child frames, and framing a graph run.
export { automationStudioRunFrames } from "./run-holder.ts";
export { automationStudioRootInvocation, runAutomationStudioGraphInFrame } from "./graph-frame.ts";
export { automationStudioChildInvocation } from "./child-frame.ts";
export { automationStudioTraceInFrame } from "./framed-trace.ts";
// Call Subflow: a sibling Subflow graph run as a frame of its own.
export { automationStudioCallSubflow, type AutomationStudioCalledSubflow } from "./call-subflow.ts";

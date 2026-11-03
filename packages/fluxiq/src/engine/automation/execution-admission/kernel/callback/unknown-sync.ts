import type { AutomationStudioGraphExecutionOptions } from "../../../contracts/index.ts";
import { AutomationObservationBindings } from "../../bindings.ts";
import { ExecutionObservationSource } from "../../../../../runtime/execution-observation/index.ts";

/** Retains the actual current frame's terminal marker for its normal async flush. */
export function markAutomationCallbackFrameUnknownSync(options: AutomationStudioGraphExecutionOptions): void {
  const observation = AutomationObservationBindings.of(options);
  if (!observation) return;
  const state = AutomationObservationBindings.read(observation);
  const callbacks = state.source.owner;
  if (!(callbacks instanceof ExecutionObservationSource)) throw new Error("execution_observation.foreign_automation_source");
  try {
    callbacks.markFrameUnknown(callbacks.forParent(state.parent));
  } catch (error) {
    if (!state.invocation && error instanceof Error && error.message === "execution_observation.durable_frame_missing") return;
    throw error;
  }
}

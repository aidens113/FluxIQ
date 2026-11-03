import type { ExecutionCallbackObservation } from "./contracts/index.ts";
import { ExecutionObservationBindings } from "./bindings.ts";

/** Fence the original entered frame through its existing private binding. */
export function markObservedExecutionFrameUnknown(observation: ExecutionCallbackObservation): void {
  ExecutionObservationBindings.read(observation).source.markFrameUnknown(observation);
}

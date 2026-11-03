import type { ExecutionCallbackObservation } from "./contracts/index.ts";
import { ExecutionObservationBindings } from "./bindings.ts";

/** Queries only the original source; foreign/delegation/mismatch failures propagate. */
export function hasObservedExecutionFrame(observation: ExecutionCallbackObservation): boolean {
  return ExecutionObservationBindings.read(observation).source.hasFrame(observation);
}

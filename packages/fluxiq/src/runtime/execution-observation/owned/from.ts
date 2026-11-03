import type { ExecutionCallbackObservation } from "../contracts/index.ts";
import type { ExecutionObservationSource } from "../source.ts";
import { ExecutionObservationBindings } from "../bindings.ts";

/** Original source membership before admission; copied observations provide no authority. */
export function isExecutionCallbackObservationFrom(observation: ExecutionCallbackObservation | undefined, source: ExecutionObservationSource): boolean {
  return ExecutionObservationBindings.isFrom(observation, source);
}

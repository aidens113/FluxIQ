import type { ExecutionCallbackObservation } from "../contracts/index.ts";
import { ExecutionObservationBindings } from "../bindings.ts";

/** Only the original active call can read its private companion; no raw argument gains fields. */
export function readObservedExecutionCallbackCarrier(carrier: object | undefined, receiver: unknown, callback: object): ExecutionCallbackObservation | undefined {
  return carrier ? ExecutionObservationBindings.readCarrier(carrier, receiver, callback) : undefined;
}

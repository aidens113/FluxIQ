import type { ExecutionCallbackObservation } from "./contracts/index.ts";
import { executionDataProperty } from "./data-property.ts";
import { markObservedExecutionFrameUnknown } from "./mark-unknown.ts";

/** Descriptor refusal is retained on the original already-entered caller frame. */
export function observedExecutionProperty<T extends object, K extends keyof T>(observation: ExecutionCallbackObservation | undefined, receiver: T, key: K): T[K];
export function observedExecutionProperty(observation: ExecutionCallbackObservation | undefined, receiver: object, key: PropertyKey): unknown;
export function observedExecutionProperty(observation: ExecutionCallbackObservation | undefined, receiver: object, key: PropertyKey): unknown {
  if (!observation) return Reflect.get(receiver, key);
  try {
    return executionDataProperty(receiver, key);
  } catch (error) {
    markObservedExecutionFrameUnknown(observation);
    throw error;
  }
}

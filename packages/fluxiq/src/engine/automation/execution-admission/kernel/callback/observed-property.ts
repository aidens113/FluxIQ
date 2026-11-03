import type { ExecutionCallbackObservation } from "../../../../../runtime/execution-observation/index.ts";
import { markObservedExecutionFrameUnknown } from "../../../../../runtime/execution-observation/index.ts";
import { automationDataProperty } from "../../options/index.ts";

/** Descriptor refusal belongs to the actual callback's existing entered frame. */
export function automationObservedProperty<T extends object, K extends keyof T>(observation: ExecutionCallbackObservation | undefined, receiver: T, key: K): T[K] {
  if (!observation) return receiver[key];
  try {
    return automationDataProperty(receiver, key);
  } catch (error) {
    markObservedExecutionFrameUnknown(observation);
    throw error;
  }
}

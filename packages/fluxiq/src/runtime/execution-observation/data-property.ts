import { executionPropertyDescriptor } from "./descriptor.ts";

/** Retains typed data fields; unknown optional callback names remain unknown. */
export function executionDataProperty<T extends object, K extends keyof T>(receiver: T, key: K): T[K];
export function executionDataProperty(receiver: object, key: PropertyKey): unknown;
export function executionDataProperty(receiver: object, key: PropertyKey): unknown {
  const descriptor = executionPropertyDescriptor(receiver, key);
  if (descriptor && !("value" in descriptor)) throw new Error("execution_observation.callback_accessor_unsupported");
  return descriptor?.value;
}

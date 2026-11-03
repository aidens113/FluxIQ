import { automationPropertyDescriptor } from "./descriptor.ts";

/** Reads the original data field, including inherited methods with their original receiver. */
export function automationDataProperty<T extends object, K extends keyof T>(receiver: T, key: K): T[K];
export function automationDataProperty(receiver: object, key: PropertyKey): unknown;
export function automationDataProperty(receiver: object, key: PropertyKey): unknown {
  const descriptor = automationPropertyDescriptor(receiver, key);
  if (descriptor && !("value" in descriptor)) throw new Error("execution_observation.callback_accessor_unsupported");
  return descriptor?.value;
}

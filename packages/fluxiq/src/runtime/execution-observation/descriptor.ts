import { isProxy } from "node:util/types";

/** Walks original own/inherited descriptors without evaluating an accessor. */
export function executionPropertyDescriptor(receiver: object, key: PropertyKey): PropertyDescriptor | undefined {
  for (let current: object | null = receiver; current; current = Object.getPrototypeOf(current)) {
    if (isProxy(current)) throw new Error("execution_observation.callback_proxy_unsupported");
    const descriptor = Object.getOwnPropertyDescriptor(current, key);
    if (descriptor) return descriptor;
  }
  return undefined;
}

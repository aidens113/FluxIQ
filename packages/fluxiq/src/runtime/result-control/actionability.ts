import { readRuntimeTargetActionability } from "./read-actionability.ts";

/** Copy only optional target control data; every actual result descriptor stands. */
export function projectRuntimeTargetActionability<T extends object>(result: T): T {
  const reading = readRuntimeTargetActionability(result);
  if (reading.kind === "absent") return result;
  // Do not reflect the unreadable optional slot again while copying the actual
  // result. A proxy may refuse that one descriptor without hiding the call.
  const fields: PropertyDescriptorMap = {};
  for (const key of Reflect.ownKeys(result)) {
    if (key === "actionability") continue;
    const descriptor = Object.getOwnPropertyDescriptor(result, key);
    if (descriptor) Object.defineProperty(fields, key, { value: descriptor, enumerable: true, configurable: true, writable: true });
  }
  if (reading.kind === "valid") fields.actionability = { value: reading.record, enumerable: true, configurable: true, writable: true };
  return Object.create(Object.getPrototypeOf(result), fields) as T;
}

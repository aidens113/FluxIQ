import { dataFieldPathSteps, type DataFieldPath } from "@fluxiq/contracts/fluxnode";
import type { JsonValue } from "../../../../../core/index.ts";

/** The value at `path` of `value`; null when any step of it is missing. */
export function readField(value: JsonValue, path: DataFieldPath): JsonValue {
  let current: JsonValue = value;
  for (const step of dataFieldPathSteps(path)) {
    if (Array.isArray(current)) {
      const item = typeof step === "number" ? current[step] : undefined;
      if (item === undefined) return null;
      current = item;
    } else if (typeof current === "object" && current !== null && Object.hasOwn(current, String(step))) {
      current = current[String(step)] as JsonValue;
    } else {
      return null;
    }
  }
  return current;
}

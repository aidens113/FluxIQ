import type { JsonObject } from "../../../../core/index.ts";
import type { RecordingExpectedStateOutcome } from "./outcome.ts";

/** A nonempty, cloneable plain condition is retained without interpreting it. */
export function cloneRecordingExpectedState(value: unknown): RecordingExpectedStateOutcome {
  if (value === undefined || value === null) return { kind: "absent" };
  if (typeof value !== "object" || Array.isArray(value)) return { kind: "not_plain" };
  const prototype: unknown = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return { kind: "not_plain" };
  let state: JsonObject;
  try {
    state = structuredClone(value) as JsonObject;
  } catch {
    return { kind: "uncloneable" };
  }
  return Object.keys(state).length > 0 ? { kind: "state", state } : { kind: "empty" };
}

import type { AutomationStudioRecordTraceSummary } from "../../records/index.ts";

/** The live run's own record owner, bound by the engine; request data never supplies this map. */
type CapturedOwner = Pick<AutomationStudioRecordTraceSummary, "captured">;

/**
 * Whether original handoff objects reach an array or row the live run captured, found by identity only.
 * `unavailable` means the question could not be answered, which callers treat like `captured`.
 */
export class AutomationStudioInputUseOwnedCapture {
  static inspect(owner: CapturedOwner | undefined, original: unknown): "clear" | "captured" | "unavailable" {
    if (!owner) return "unavailable";
    try {
      const captured = owner.captured();
      if (!captured.size) return "clear";
      return reaches(original, captured) ? "captured" : "clear";
    } catch {
      // Any failure leaves the identity question unanswered, which the caller treats as captured.
      return "unavailable";
    }
  }
}

/** Cycle-safe and iterative: shared and repeated references are visited once, and depth cannot overflow the stack. */
function reaches(original: unknown, captured: ReadonlyMap<object, unknown>): boolean {
  const pending: unknown[] = [original];
  const visited = new Set<object>();
  while (pending.length) {
    const value = pending.pop();
    if (typeof value === "function") throw new Error("input_use.records_uninspectable");
    if (!value || typeof value !== "object" || visited.has(value)) continue;
    if (captured.has(value)) return true;
    visited.add(value);
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== Array.prototype && prototype !== null) throw new Error("input_use.records_uninspectable");
    for (const key of Reflect.ownKeys(value)) {
      const descriptor = Reflect.getOwnPropertyDescriptor(value, key);
      // An accessor's value cannot be read without running it.
      if (descriptor && !Object.hasOwn(descriptor, "value")) throw new Error("input_use.records_uninspectable");
      pending.push(descriptor?.value);
    }
  }
  return false;
}

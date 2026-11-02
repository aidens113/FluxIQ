import type { RuntimeTargetActionabilityRecord } from "./record.ts";

type ActionabilityValidation =
  | { kind: "valid"; record: RuntimeTargetActionabilityRecord }
  | { kind: "rejected"; reason: "not_plain_record" | "unknown_key" | "actionable_not_data" | "actionable_not_boolean" | "cause_on_actionable" | "cause_missing" | "cause_not_data" | "cause_unknown" }
  | { kind: "unreadable"; reason: "record_reflection_failed" };

/** Reads only exact plain data, returning a fresh minimal record or unknown.
 * Accessors are never invoked, and malformed optional metadata never throws. */
export function parseRuntimeTargetActionabilityRecord(value: unknown): RuntimeTargetActionabilityRecord | undefined {
  const validation = validateActionability(value);
  return validation.kind === "valid" ? validation.record : undefined;
}

/** Validation classifies malformed data and reflection failures separately;
 * only the public optional API projects either outcome to an unknown fact. */
function validateActionability(value: unknown): ActionabilityValidation {
  try {
    if (typeof value !== "object" || value === null || Array.isArray(value)) return { kind: "rejected", reason: "not_plain_record" };
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) return { kind: "rejected", reason: "not_plain_record" };
    const keys = Reflect.ownKeys(value);
    if (keys.some((key) => key !== "actionable" && key !== "cause")) return { kind: "rejected", reason: "unknown_key" };
    const actionable = Object.getOwnPropertyDescriptor(value, "actionable");
    if (!actionable || !("value" in actionable)) return { kind: "rejected", reason: "actionable_not_data" };
    if (actionable.value === true) return keys.length === 1
      ? { kind: "valid", record: { actionable: true } }
      : { kind: "rejected", reason: "cause_on_actionable" };
    if (actionable.value !== false) return { kind: "rejected", reason: "actionable_not_boolean" };
    if (keys.length !== 2) return { kind: "rejected", reason: "cause_missing" };
    const cause = Object.getOwnPropertyDescriptor(value, "cause");
    if (!cause || !("value" in cause)) return { kind: "rejected", reason: "cause_not_data" };
    if (cause.value !== "hidden" && cause.value !== "disabled" && cause.value !== "covered") return { kind: "rejected", reason: "cause_unknown" };
    return { kind: "valid", record: { actionable: false, cause: cause.value } };
  } catch {
    return { kind: "unreadable", reason: "record_reflection_failed" };
  }
}

// Compatibility names retained for existing Automation Studio consumers.
export {
  parseRuntimeTargetActionabilityRecord as parseAutomationStudioTargetActionabilityRecord
};

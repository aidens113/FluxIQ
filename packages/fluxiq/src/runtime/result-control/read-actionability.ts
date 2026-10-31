import { parseAutomationStudioTargetActionabilityRecord, type AutomationStudioTargetActionabilityRecord } from "@fluxiq/contracts/automation-studio";

type ActionabilityReading =
  | { kind: "absent" }
  | { kind: "valid"; record: AutomationStudioTargetActionabilityRecord }
  | { kind: "rejected"; reason: "not_record" | "accessor_metadata" | "invalid_record" }
  | { kind: "unreadable"; reason: "property_reflection_failed" };

/** Read optional control data without executing a producer's property getter. */
export function readRuntimeTargetActionability(value: unknown): ActionabilityReading {
  try {
    if (typeof value !== "object" || value === null || Array.isArray(value)) return { kind: "rejected", reason: "not_record" };
    const descriptor = Object.getOwnPropertyDescriptor(value, "actionability");
    if (!descriptor) return { kind: "absent" };
    if (!("value" in descriptor)) return { kind: "rejected", reason: "accessor_metadata" };
    const record = parseAutomationStudioTargetActionabilityRecord(descriptor.value);
    return record ? { kind: "valid", record } : { kind: "rejected", reason: "invalid_record" };
  } catch {
    return { kind: "unreadable", reason: "property_reflection_failed" };
  }
}

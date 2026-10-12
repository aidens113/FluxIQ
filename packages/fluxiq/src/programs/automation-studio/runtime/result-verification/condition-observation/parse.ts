import type { AutomationStudioResultConditionObservation } from "../index.ts";

const KEYS = new Set(["conditionIndex", "state", "value", "source", "readKind", "page", "item"]);
const KINDS = new Set(["text", "attribute", "value", "link", "column"]);

/** Closed passive witness validation; null is legacy unknown, never an absent read. */
export function automationStudioResultConditionObservation(value: unknown, conditionIndex: number): AutomationStudioResultConditionObservation | null | undefined {
  if (value === null) return null;
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const row = value as Record<string, unknown>;
  if (Object.keys(row).some(key => !KEYS.has(key)) || !["conditionIndex", "state", "source", "page", "item"].every(key => Object.hasOwn(row, key))) return undefined;
  if (!Number.isSafeInteger(conditionIndex) || conditionIndex < 0 || row.conditionIndex !== conditionIndex) return undefined;
  const source = row.source;
  if (source !== "field" && source !== "read") return undefined;
  const page = row.page, item = row.item;
  if (typeof page !== "number" || !Number.isSafeInteger(page) || page < 1 || typeof item !== "number" || !Number.isSafeInteger(item) || item < 1) return undefined;
  const readKind = row.readKind;
  if (readKind !== undefined && (typeof readKind !== "string" || !KINDS.has(readKind))) return undefined;
  const base: Pick<AutomationStudioResultConditionObservation, "conditionIndex" | "source" | "page" | "item" | "readKind"> = { conditionIndex, source, page, item, ...(readKind !== undefined ? { readKind: readKind as NonNullable<AutomationStudioResultConditionObservation["readKind"]> } : {}) };
  if (row.state === "present") return typeof row.value === "string" && Object.hasOwn(row, "value") ? { ...base, state: "present", value: row.value } : undefined;
  if (row.state !== "absent" && row.state !== "unavailable" && row.state !== "withheld") return undefined;
  return Object.hasOwn(row, "value") ? undefined : { ...base, state: row.state };
}

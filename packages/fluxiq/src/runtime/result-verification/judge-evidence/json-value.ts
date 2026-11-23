import type { JsonValue } from "../../../core/index.ts";

/** Validate every member, with no depth or item cap; cycles and non-JSON values are invalid. */
export function automationStudioJudgeEvidenceJsonValue(value: unknown): value is JsonValue {
  const active = new Set<object>();
  const pending: Array<{ value: unknown; leaving?: boolean }> = [{ value }];
  while (pending.length > 0) {
    const next = pending.pop()!;
    const item = next.value;
    if (item === null || typeof item === "string" || typeof item === "boolean") continue;
    if (typeof item === "number") {
      if (!Number.isFinite(item)) return false;
      continue;
    }
    if (typeof item !== "object") return false;
    if (next.leaving) {
      active.delete(item);
      continue;
    }
    if (active.has(item) || (!Array.isArray(item) && ![Object.prototype, null].includes(Object.getPrototypeOf(item)))) return false;
    active.add(item);
    pending.push({ value: item, leaving: true });
    for (const child of Array.isArray(item) ? Array.from(item) : Object.values(item)) pending.push({ value: child });
  }
  return true;
}

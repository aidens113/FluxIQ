import type { JsonValue } from "../../../../../core/index.ts";

type Copied = { kind: "copied"; value: JsonValue } | { kind: "rejected" } | { kind: "unreadable" };
type Budget = { entries: number; ancestors: Set<object> };

/** Copies bounded JSON without executing accessors, retaining no live aliases. */
export function automationStudioRefreshSnapshot(value: unknown): Copied {
  return copy(value, { entries: 0, ancestors: new Set() }, 0);
}

function copy(value: unknown, budget: Budget, depth: number): Copied {
  if (++budget.entries > 20_000 || depth > 32) return { kind: "rejected" };
  if (value === null || typeof value === "string" || typeof value === "boolean") return { kind: "copied", value };
  if (typeof value === "number") return Number.isFinite(value) ? { kind: "copied", value } : { kind: "rejected" };
  if (typeof value !== "object" || budget.ancestors.has(value)) return { kind: "rejected" };
  let array: boolean;
  let descriptors: PropertyDescriptorMap;
  try {
    array = Array.isArray(value);
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== null && prototype !== (array ? Array.prototype : Object.prototype)) return { kind: "rejected" };
    if (Reflect.ownKeys(value).some((key) => typeof key !== "string")) return { kind: "rejected" };
    descriptors = Object.getOwnPropertyDescriptors(value);
  } catch {
    return { kind: "unreadable" };
  }
  const keys = Object.keys(descriptors);
  if (keys.some((key) => key === "__proto__" || key === "constructor" || key === "prototype" || !("value" in descriptors[key]!))) return { kind: "rejected" };
  const length = array ? descriptors.length?.value : undefined;
  if (array && (!Number.isSafeInteger(length) || length < 0 || length > 20_000 || keys.length !== length + 1)) return { kind: "rejected" };
  budget.ancestors.add(value);
  const result: JsonValue = array ? [] : {};
  const entries = array ? Array.from({ length }, (_, index) => String(index)) : keys;
  for (const key of entries) {
    const descriptor = descriptors[key];
    if (!descriptor || !descriptor.enumerable) {
      budget.ancestors.delete(value);
      return { kind: "rejected" };
    }
    const item = copy(descriptor.value, budget, depth + 1);
    if (item.kind !== "copied") {
      budget.ancestors.delete(value);
      return item;
    }
    if (Array.isArray(result)) result.push(item.value);
    else result[key] = item.value;
  }
  budget.ancestors.delete(value);
  return { kind: "copied", value: Object.freeze(result) as JsonValue };
}

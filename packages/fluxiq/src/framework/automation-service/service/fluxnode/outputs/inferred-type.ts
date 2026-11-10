// The type Core infers for outputs no type was declared for (fluxnode-plan N3, `outputsType`): the
// narrowest schema in the contracts' subset that the value fits. A list's items are one schema: the
// merge of every item's, where an object's property is required only when every item has it, and two
// items of different kinds give a list of any value. Bounded as the subset is (`JSON_TYPE_SCHEMA_LIMITS`):
// past its depth or property count, a part is left as any value, which every value fits.

import { JSON_TYPE_SCHEMA_LIMITS, type JsonTypeSchema } from "@fluxiq/contracts/fluxnode";
import type { JsonValue } from "../../../../../core/index.ts";

export function fluxNodeInferredType(value: JsonValue): JsonTypeSchema {
  return inferred(value, 1);
}

function inferred(value: JsonValue, depth: number): JsonTypeSchema {
  if (depth >= JSON_TYPE_SCHEMA_LIMITS.maxDepth) return {};
  if (value === null) return { type: "null" };
  if (typeof value === "string") return { type: "string" };
  if (typeof value === "boolean") return { type: "boolean" };
  if (typeof value === "number") return { type: Number.isInteger(value) ? "integer" : "number" };
  if (Array.isArray(value)) {
    const items = value.map((item) => inferred(item, depth + 1)).reduce<JsonTypeSchema | undefined>((merged, next) => (merged === undefined ? next : merge(merged, next)), undefined);
    return items === undefined ? { type: "array" } : { type: "array", items };
  }
  const names = Object.keys(value);
  if (names.length > JSON_TYPE_SCHEMA_LIMITS.maxProperties) return { type: "object" };
  const properties: Record<string, JsonTypeSchema> = {};
  for (const name of names) properties[name] = inferred(value[name] as JsonValue, depth + 1);
  return { type: "object", properties, required: [...names] };
}

/** One schema both fit. */
function merge(left: JsonTypeSchema, right: JsonTypeSchema): JsonTypeSchema {
  if (sameKind(left, right, "integer", "number") || sameKind(left, right, "number", "integer")) return { type: "number" };
  if (left.type !== right.type || typeof left.type !== "string") return {};
  if (left.type === "array") {
    if (left.items === undefined || right.items === undefined) return { type: "array", ...(left.items ?? right.items ? { items: (left.items ?? right.items)! } : {}) };
    return { type: "array", items: merge(left.items, right.items) };
  }
  if (left.type !== "object") return { type: left.type };
  const properties: Record<string, JsonTypeSchema> = {};
  const names = new Set([...Object.keys(left.properties ?? {}), ...Object.keys(right.properties ?? {})]);
  if (names.size > JSON_TYPE_SCHEMA_LIMITS.maxProperties) return { type: "object" };
  for (const name of names) {
    const one = left.properties?.[name];
    const other = right.properties?.[name];
    properties[name] = one && other ? merge(one, other) : (one ?? other)!;
  }
  const required = (left.required ?? []).filter((name) => (right.required ?? []).includes(name));
  return { type: "object", properties, ...(required.length ? { required } : {}) };
}

function sameKind(left: JsonTypeSchema, right: JsonTypeSchema, one: string, other: string): boolean {
  return left.type === one && right.type === other;
}

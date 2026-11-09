import type { JsonValue } from "../../../../../core/index.ts";

function rank(value: JsonValue): number {
  if (value === null) return 4;
  if (typeof value === "number") return 0;
  if (typeof value === "string") return 1;
  if (typeof value === "boolean") return 2;
  return 3;
}

/**
 * A total order for sorting: numbers, then text, then booleans, then structures,
 * then null; within a kind, by value. Structures compare equal.
 */
export function compareValues(left: JsonValue, right: JsonValue): number {
  const kinds = rank(left) - rank(right);
  if (kinds !== 0) return kinds;
  if (typeof left === "number" && typeof right === "number") return left - right;
  if (typeof left === "string" && typeof right === "string") return left < right ? -1 : left > right ? 1 : 0;
  if (typeof left === "boolean" && typeof right === "boolean") return Number(left) - Number(right);
  return 0;
}

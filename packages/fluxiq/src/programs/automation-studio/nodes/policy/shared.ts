import type { JsonValue } from "../../../../core";

export function jsonParameter(value: unknown, fallback: JsonValue): JsonValue {
  if (value === undefined) return fallback;
  return value as JsonValue;
}

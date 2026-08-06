import type { JsonValue } from "../../../../core/index.ts";

export function jsonParameter(value: unknown, fallback: JsonValue): JsonValue {
  if (value === undefined) return fallback;
  return value as JsonValue;
}

import type { JsonValue } from "../../../core/index.ts";

export function objectValue(value: unknown): Record<string, JsonValue> {
  if (value && typeof value === "object" && !Array.isArray(value)) return value as Record<string, JsonValue>;
  return {};
}

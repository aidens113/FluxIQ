import type { JsonObject, JsonValue } from "../../../core/index.ts";
export function compactJsonObject(value: Record<string, JsonValue | undefined>): JsonObject {
  const kept: JsonObject = {};
  for (const [key, item] of Object.entries(value)) if (item !== undefined) kept[key] = item;
  return kept;
}

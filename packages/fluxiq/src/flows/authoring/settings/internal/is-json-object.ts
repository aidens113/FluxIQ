import type { JsonValue } from "../../../../core/index.ts";
import type { JsonObject } from "../../../../core/index.ts";

export function isJsonObject(value: JsonValue | undefined): value is JsonObject {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

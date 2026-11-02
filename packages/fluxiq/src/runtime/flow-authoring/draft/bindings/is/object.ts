import type { JsonValue, JsonObject } from "../../../../../core/index.ts";

export function isObject(value: JsonValue | undefined): value is JsonObject {
    return value !== null && typeof value === "object" && !Array.isArray(value);
}

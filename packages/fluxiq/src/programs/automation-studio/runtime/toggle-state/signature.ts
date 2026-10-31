import type { JsonObject, JsonValue } from "../../../../core/index.ts";

/** A state's bounded opaque signature, copied only when it is nonempty plain JSON. */
export function automationStudioToggleStateSignature(value: unknown): JsonObject | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value) || !Object.keys(value).length || !plain(value)) return undefined;
  return JSON.stringify(value).length <= 4_096 ? structuredClone(value) as JsonObject : undefined;
}

function plain(value: unknown, seen = new Set<object>(), depth = 0): value is JsonValue {
  if (value === null || typeof value === "string" || typeof value === "boolean") return true;
  if (typeof value === "number") return Number.isFinite(value);
  if (!value || typeof value !== "object" || seen.has(value) || depth > 12) return false;
  seen.add(value);
  if (Array.isArray(value)) return value.length <= 256 && value.every((item) => plain(item, seen, depth + 1));
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return false;
  const fields = Object.getOwnPropertyDescriptors(value);
  return Reflect.ownKeys(fields).length <= 256 && Reflect.ownKeys(fields).every((key) => typeof key === "string"
    && key.length <= 200 && fields[key]!.enumerable && "value" in fields[key]! && plain(fields[key]!.value, seen, depth + 1));
}

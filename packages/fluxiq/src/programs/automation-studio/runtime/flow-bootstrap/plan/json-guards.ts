// Structural guards for untrusted JSON reaching Flow Bootstrap: what counts
// as a plain record, what is a bounded JSON value, and how many bytes a value
// serialises to when it serialises at all.
import type { JsonObject, JsonValue } from "../../../../../core/index.ts";

export function safeByteLength(value: unknown): number {
  try { return Buffer.byteLength(JSON.stringify(value), "utf8"); } catch { return Number.POSITIVE_INFINITY; }
}

export function isJsonObject(value: unknown): value is JsonObject {
  return isRecord(value) && isJsonValue(value);
}

export function isJsonValue(value: unknown, seen = new Set<object>(), depth = 0): value is JsonValue {
  if (value === null || typeof value === "string" || typeof value === "boolean") return true;
  if (typeof value === "number") return Number.isFinite(value);
  if (!value || typeof value !== "object" || seen.has(value as object) || depth > 12) return false;
  seen.add(value as object);
  if (Array.isArray(value)) return value.length <= 256 && value.every((item) => isJsonValue(item, seen, depth + 1));
  const entries = Object.entries(value as Record<string, unknown>);
  return entries.length <= 256 && entries.every(([key, item]) => key.length <= 200 && isJsonValue(item, seen, depth + 1));
}

export function isRecord(value: unknown): value is Record<string, any> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}


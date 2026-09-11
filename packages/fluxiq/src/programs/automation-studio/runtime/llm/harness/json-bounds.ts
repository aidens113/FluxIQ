import type { JsonObject, JsonValue } from "../../../../../core/index.ts";

export function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

export function isBoundedString(value: unknown): value is string {
  return typeof value === "string" && value.length <= 20_000;
}

export function validRequestIdentity(value: string | undefined): value is string {
  return typeof value === "string" && /^[a-z0-9_.:-]{1,200}$/i.test(value);
}

export function isJsonObject(value: unknown): value is JsonObject {
  return isRecord(value) && isJsonValue(value);
}

export function isJsonValue(value: unknown, seen = new Set<unknown>(), depth = 0): value is JsonValue {
  if (value === null || typeof value === "string" || typeof value === "boolean") return true;
  if (typeof value === "number") return Number.isFinite(value);
  if (!value || typeof value !== "object" || seen.has(value) || depth > 20) return false;
  seen.add(value);
  if (Array.isArray(value)) return value.length <= 1000 && value.every((item) => isJsonValue(item, seen, depth + 1));
  const entries = Object.entries(value as Record<string, unknown>);
  return entries.length <= 1000 && entries.every(([key, item]) => key.length <= 500 && isJsonValue(item, seen, depth + 1));
}

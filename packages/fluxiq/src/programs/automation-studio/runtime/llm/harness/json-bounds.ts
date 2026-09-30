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

/**
 * The deepest a JSON value may nest before a walk refuses it. A recursion
 * guard, not a size bound: no page, capture or model answer comes near it, and
 * past it a recursive walk would exhaust the stack.
 */
export const AUTOMATION_STUDIO_JSON_MAX_DEPTH = 64;

/**
 * Whether a value is JSON: finite numbers, no cycles, and nesting within the
 * recursion guard. There is no bound on how many items or entries it holds or
 * how long its keys and strings are -- the model is shown the whole value.
 */
export function isJsonValue(value: unknown, seen = new Set<unknown>(), depth = 0): value is JsonValue {
  if (value === null || typeof value === "string" || typeof value === "boolean") return true;
  if (typeof value === "number") return Number.isFinite(value);
  if (!value || typeof value !== "object" || seen.has(value) || depth > AUTOMATION_STUDIO_JSON_MAX_DEPTH) return false;
  seen.add(value);
  const valid = Array.isArray(value)
    ? value.every((item) => isJsonValue(item, seen, depth + 1))
    : Object.values(value as Record<string, unknown>).every((item) => isJsonValue(item, seen, depth + 1));
  seen.delete(value);
  return valid;
}

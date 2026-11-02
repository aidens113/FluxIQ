import type { JsonObject, JsonValue } from "../../../core/index.ts";

function isJson(value: unknown, ancestors = new Set<object>()): value is JsonValue {
  if (value === null || typeof value === "string" || typeof value === "boolean") return true;
  if (typeof value === "number") return Number.isFinite(value);
  if (!value || typeof value !== "object" || ancestors.has(value)) return false;
  ancestors.add(value);
  const valid = (Array.isArray(value) ? value : Object.values(value)).every(item => isJson(item, ancestors));
  ancestors.delete(value);
  return valid;
}

export function recordingInputPayload(value: unknown): JsonObject {
  if (!isJson(value)) throw new Error("recording.invalid_io_payload");
  if (value !== null && typeof value === "object" && !Array.isArray(value)) return value;
  return { value };
}

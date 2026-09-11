import type { JsonObject } from "../../../../core/index.ts";

// Coercions from unknown to the JSON shapes the service stores. Shared by the
// facade and its collaborators.

export function isJsonRecord(value: unknown): value is JsonObject {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

export function jsonObjectFromUnknown(value: unknown): JsonObject | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonObject : null;
}

export function stringOrNull(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

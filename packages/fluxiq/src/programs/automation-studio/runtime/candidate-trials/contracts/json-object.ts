import type { JsonObject } from "../../../../../core/index.ts";

export function isCandidateTrialJsonObject(value: unknown): value is JsonObject {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  try { return JSON.stringify(value) !== undefined; } catch { return false; }
}

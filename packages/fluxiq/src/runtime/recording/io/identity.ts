import type { JsonObject } from "../../../core/index.ts";

export function recordingEventIdentity(metadata: JsonObject | undefined): JsonObject {
  const identity: JsonObject = {};
  for (const key of ["eventId", "sourceId"]) {
    const value = metadata?.[key];
    if (typeof value === "string" && value.trim()) identity[key] = value;
  }
  return identity;
}

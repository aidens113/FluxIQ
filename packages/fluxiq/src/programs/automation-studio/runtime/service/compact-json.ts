import type { JsonObject } from "../../../../core/index.ts";

// Drops undefined entries from a JSON object. Shared by the service facade
// and the collaborators that build metadata.
export function compactJsonObject(value: Record<string, unknown>): JsonObject {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined)) as JsonObject;
}

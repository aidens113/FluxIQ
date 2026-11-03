import type { JsonObject } from "../index.ts";

/** Drops undefined object entries while preserving empty arrays and every defined value. */
export function compactJsonObject(value: Record<string, unknown>): JsonObject {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined)) as JsonObject;
}

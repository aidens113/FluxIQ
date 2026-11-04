// Deterministic digests of what identifies an act.

import { createHash } from "node:crypto";

/** Deterministic JSON: object keys sorted, arrays in order. */
function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson((value as Record<string, unknown>)[key])}`).join(",")}}`;
  return JSON.stringify(value) ?? "null";
}

/** The hex digest of a value by its content, whatever order its keys were written in. */
export function automationStudioAttemptActDigest(value: unknown): string {
  return createHash("sha256").update(stableJson(value)).digest("hex");
}

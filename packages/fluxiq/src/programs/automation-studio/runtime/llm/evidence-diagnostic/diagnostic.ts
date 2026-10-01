import type { JsonObject, JsonValue } from "../../../../../core/index.ts";

/** Copy opaque structural diagnostics. The producing domain owns semantic and secret screening. */
export function automationStudioLlmEvidenceDiagnostic(value: unknown): JsonObject | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const entries = Object.entries(value);
  if (entries.length === 0 || entries.length > 16) return undefined;
  const diagnostic: JsonObject = {};
  for (const [key, member] of entries) {
    if (!/^[A-Za-z][A-Za-z0-9_]{0,63}$/u.test(key)) return undefined;
    if (Array.isArray(member)) {
      if (!member.every(scalar)) return undefined;
      diagnostic[key] = [...member] as JsonValue[];
    } else {
      if (!scalar(member)) return undefined;
      diagnostic[key] = member as JsonValue;
    }
  }
  return diagnostic;
}

function scalar(value: unknown): boolean {
  return typeof value === "boolean"
    || (typeof value === "number" && Number.isSafeInteger(value) && value >= 0)
    || (typeof value === "string" && /^[A-Za-z0-9_.:-]{1,128}$/u.test(value));
}

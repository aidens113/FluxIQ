import type { JsonValue } from "../../../../core/index.ts";

export function automationStudioLlmEvidenceCanonicalJson(value: JsonValue): string {
  if (Array.isArray(value)) return `[${value.map(automationStudioLlmEvidenceCanonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${automationStudioLlmEvidenceCanonicalJson(value[key] as JsonValue)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

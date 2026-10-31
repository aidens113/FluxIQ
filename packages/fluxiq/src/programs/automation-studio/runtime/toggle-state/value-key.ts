import type { JsonValue } from "../../../../core/index.ts";

/** JSON equality independent of object key order; the domain's signature remains opaque. */
export function automationStudioToggleStateValueKey(value: JsonValue): string {
  if (Array.isArray(value)) return `[${value.map(automationStudioToggleStateValueKey).join(",")}]`;
  if (value !== null && typeof value === "object") return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${automationStudioToggleStateValueKey(value[key]!)}`).join(",")}}`;
  return JSON.stringify(value);
}

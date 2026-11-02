import type { JsonValue } from "../../../../core/index.ts";
import { jsonValue } from "../json.ts";
import { stringValue } from "../string.ts";

export function setPathValue(source: Record<string, JsonValue>, path: unknown, value: unknown): Record<string, JsonValue> {
  const parts = stringValue(path).split(".").map((part) => part.trim()).filter(Boolean);
  if (!parts.length) return source;
  const next = { ...source };
  let cursor: Record<string, JsonValue> = next;
  for (const part of parts.slice(0, -1)) {
    const existing = cursor[part];
    const child = existing && typeof existing === "object" && !Array.isArray(existing) ? { ...existing } as Record<string, JsonValue> : {};
    cursor[part] = child;
    cursor = child;
  }
  cursor[parts[parts.length - 1]!] = jsonValue(value);
  return next;
}

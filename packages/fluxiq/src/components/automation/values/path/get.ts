import { stringValue } from "../string.ts";

export function getPathValue(source: unknown, path: unknown): unknown {
  const parts = stringValue(path).split(".").map((part) => part.trim()).filter(Boolean);
  let current = source;
  for (const part of parts) {
    if (current && typeof current === "object" && part in current) current = (current as Record<string, unknown>)[part];
    else return undefined;
  }
  return current;
}

import type { JsonObject } from "../../../../core/index.ts";

export function executableRouteValueAtPath(root: JsonObject, path: string): unknown {
  const parts = path.split(".").filter(Boolean);
  let value: unknown = root;
  for (const part of parts) {
    if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
    value = (value as Record<string, unknown>)[part];
  }
  return value;
}

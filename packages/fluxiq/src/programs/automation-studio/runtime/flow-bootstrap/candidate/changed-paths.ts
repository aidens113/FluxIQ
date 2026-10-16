import type { JsonValue } from "../../../../../core/index.ts";
import { canonical } from "./canonical.ts";

/** The paths of the plan a revision changed from the one before it, `plan` itself when there was none. */
export function changedPaths(before: JsonValue | undefined, after: JsonValue, path = "plan"): string[] {
  if (before === undefined) return [path];
  if (canonical(before) === canonical(after)) return [];
  if (before && after && typeof before === "object" && typeof after === "object") {
    const old = before as Record<string, JsonValue>, next = after as Record<string, JsonValue>;
    return [...new Set([...Object.keys(old), ...Object.keys(next)])].sort().flatMap((key) => next[key] === undefined ? [`${path}.${key}`] : changedPaths(old[key], next[key]!, `${path}.${key}`));
  }
  return [path];
}

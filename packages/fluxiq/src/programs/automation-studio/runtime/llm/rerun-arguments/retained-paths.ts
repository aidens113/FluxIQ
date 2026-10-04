import type { JsonObject, JsonValue } from "../../../../../core/index.ts";
import { automationStudioRerunPatchPlacement } from "./patch-placement.ts";

/** Paths still present in the actual merge, omitted inside objects the patch restates. */
export function automationStudioRerunRetainedPaths(previous: JsonObject | undefined, patch: JsonObject, merged: JsonObject): { paths: string[][]; parameters: boolean } {
  const old = previous ?? {};
  const placed = automationStudioRerunPatchPlacement(old, patch);
  const parameters = Object.hasOwn(old, "node") && object(old.parameters) && object(placed.parameters) && object(merged.parameters);
  const paths: string[][] = [];
  if (parameters && object(old.parameters) && object(placed.parameters) && object(merged.parameters)) walk(old.parameters, placed.parameters, merged.parameters, [], paths, 0, true);
  else walk(old, placed, merged, [], paths, 0);
  return { paths, parameters };
}

function walk(old: JsonObject, patch: JsonObject, merged: JsonObject, prefix: string[], paths: string[][], depth: number, restated = false): void {
  if (depth > 64) return; // Recursion guard, never a path-count cap.
  for (const [key, value] of Object.entries(old)) {
    if (!Object.hasOwn(merged, key)) continue;
    const path = [...prefix, key];
    if (!Object.hasOwn(patch, key)) {
      if (prefix.length || restated) paths.push(path);
      continue;
    }
    const written = patch[key];
    const actual = merged[key];
    if (object(value) && object(written) && object(actual)) walk(value, written, actual, path, paths, depth + 1);
  }
}

function object(value: JsonValue | undefined): value is JsonObject {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

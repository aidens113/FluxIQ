import type { JsonObject } from "../../../../../core/index.ts";

/** The existing node-argument shorthand, shared by execution and diagnostics. */
export function automationStudioRerunPatchPlacement(target: JsonObject, patch: JsonObject): JsonObject {
  const names = Object.keys(patch);
  const parameters = target.parameters;
  if (!names.length || !Object.hasOwn(target, "node") || parameters === null || typeof parameters !== "object" || Array.isArray(parameters)) return patch;
  if (names.some((name) => name === "node" || name === "parameters" || name === "consequences")) return patch;
  return { parameters: patch };
}

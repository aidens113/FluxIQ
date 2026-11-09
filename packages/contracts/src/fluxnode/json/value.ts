// Whether an untrusted value is JSON, and zod schemas that accept only JSON. A value
// is JSON when it is null, a boolean, a finite number, a string, a dense array of JSON
// or a plain object of JSON: no undefined, NaN, Infinity, function, class instance,
// symbol, bigint or cycle.

import { z } from "zod";
import type { JsonObject, JsonValue } from "../../core.ts";

/** How deep a JSON value may nest before it is refused, so a hostile value cannot exhaust the stack. */
export const JSON_VALUE_MAX_DEPTH = 256;

/**
 * The JSON Pointer steps to the first part of `value` that is not JSON, or null when
 * all of it is. A value nested past `JSON_VALUE_MAX_DEPTH` counts as not JSON there.
 */
export function findNonJsonPart(value: unknown): Array<string | number> | null {
  return findIn(value, [], new Set<object>());
}

/** True when `value` is JSON throughout (see the file header). */
export function isJsonValue(value: unknown): value is JsonValue {
  return findNonJsonPart(value) === null;
}

/** True when `value` is a plain JSON object (not an array, not null). */
export function isJsonObject(value: unknown): value is JsonObject {
  return isPlainObject(value) && isJsonValue(value);
}

/** Accepts any JSON value and refuses the rest, at the step that is not JSON. */
export const jsonValueSchema: z.ZodType<JsonValue, z.ZodTypeDef, unknown> = z.unknown().transform((value, context): JsonValue => {
  const at = findNonJsonPart(value);
  if (at === null) return value as JsonValue;
  context.addIssue({ code: z.ZodIssueCode.custom, path: at, message: "Not a JSON value: use null, a boolean, a finite number, a string, an array or a plain object.", params: { code: "json.not_json" } });
  return z.NEVER;
});

/** Accepts a plain JSON object and refuses the rest. */
export const jsonObjectSchema: z.ZodType<JsonObject, z.ZodTypeDef, unknown> = z.unknown().transform((value, context): JsonObject => {
  if (!isPlainObject(value)) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "Expected a plain JSON object.", params: { code: "json.not_object" } });
    return z.NEVER;
  }
  const at = findNonJsonPart(value);
  if (at === null) return value as JsonObject;
  context.addIssue({ code: z.ZodIssueCode.custom, path: at, message: "Not a JSON value: use null, a boolean, a finite number, a string, an array or a plain object.", params: { code: "json.not_json" } });
  return z.NEVER;
});

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function findIn(value: unknown, path: Array<string | number>, ancestors: Set<object>): Array<string | number> | null {
  if (value === null || typeof value === "string" || typeof value === "boolean") return null;
  if (typeof value === "number") return Number.isFinite(value) ? null : path;
  if (typeof value !== "object") return path;
  if (path.length >= JSON_VALUE_MAX_DEPTH || ancestors.has(value)) return path;
  if (Array.isArray(value)) {
    ancestors.add(value);
    for (let index = 0; index < value.length; index += 1) {
      if (!(index in value)) return [...path, index];
      const found = findIn(value[index], [...path, index], ancestors);
      if (found !== null) return found;
    }
    ancestors.delete(value);
    return null;
  }
  if (!isPlainObject(value)) return path;
  ancestors.add(value);
  for (const key of Object.keys(value)) {
    const found = findIn(value[key], [...path, key], ancestors);
    if (found !== null) return found;
  }
  ancestors.delete(value);
  return null;
}

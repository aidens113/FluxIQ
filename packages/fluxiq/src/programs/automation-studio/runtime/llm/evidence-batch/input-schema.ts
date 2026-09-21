import type { JsonObject, JsonValue } from "../../../../../core/index.ts";

/** The bounded JSON-Schema subset evidence tools use for their object inputs. */
export function automationStudioLlmEvidenceInputMatchesSchema(input: JsonObject, schema: JsonObject): boolean {
  return matches(input, schema, 0);
}

function matches(value: JsonValue, schema: JsonObject, depth: number): boolean {
  if (depth > 20) return false;
  if (schema.const !== undefined && !sameJson(value, schema.const)) return false;
  if (Array.isArray(schema.enum) && !schema.enum.some((candidate) => sameJson(value, candidate))) return false;
  if (Array.isArray(schema.oneOf) && schema.oneOf.filter((candidate) => isObject(candidate) && matches(value, candidate, depth + 1)).length !== 1) return false;
  if (Array.isArray(schema.anyOf) && !schema.anyOf.some((candidate) => isObject(candidate) && matches(value, candidate, depth + 1))) return false;
  if (schema.type !== undefined && !matchesType(value, schema.type)) return false;

  if (typeof value === "string") {
    if (typeof schema.minLength === "number" && value.length < schema.minLength) return false;
    if (typeof schema.maxLength === "number" && value.length > schema.maxLength) return false;
    if (typeof schema.pattern === "string") {
      try {
        if (!new RegExp(schema.pattern, "u").test(value)) return false;
      } catch {
        return false;
      }
    }
  }
  if (typeof value === "number") {
    if (typeof schema.minimum === "number" && value < schema.minimum) return false;
    if (typeof schema.maximum === "number" && value > schema.maximum) return false;
  }
  if (Array.isArray(value)) {
    if (typeof schema.minItems === "number" && value.length < schema.minItems) return false;
    if (typeof schema.maxItems === "number" && value.length > schema.maxItems) return false;
    if (isObject(schema.items) && !value.every((item) => matches(item, schema.items as JsonObject, depth + 1))) return false;
  }
  if (isObject(value)) {
    const required = Array.isArray(schema.required) && schema.required.every((key) => typeof key === "string")
      ? schema.required as string[]
      : [];
    if (required.some((key) => !Object.hasOwn(value, key))) return false;
    const properties = isObject(schema.properties) ? schema.properties : {};
    for (const [key, item] of Object.entries(value)) {
      const property = properties[key];
      if (isObject(property)) {
        if (!matches(item, property, depth + 1)) return false;
      } else if (schema.additionalProperties === false) return false;
      else if (isObject(schema.additionalProperties) && !matches(item, schema.additionalProperties, depth + 1)) return false;
    }
    if (typeof schema.minProperties === "number" && Object.keys(value).length < schema.minProperties) return false;
    if (typeof schema.maxProperties === "number" && Object.keys(value).length > schema.maxProperties) return false;
  }
  return true;
}

function matchesType(value: JsonValue, type: unknown): boolean {
  if (Array.isArray(type)) return type.some((candidate) => matchesType(value, candidate));
  if (type === "null") return value === null;
  if (type === "array") return Array.isArray(value);
  if (type === "object") return isObject(value);
  if (type === "integer") return typeof value === "number" && Number.isInteger(value);
  return typeof type === "string" && typeof value === type;
}

function isObject(value: unknown): value is JsonObject {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function sameJson(left: unknown, right: unknown): boolean {
  try {
    return JSON.stringify(left) === JSON.stringify(right);
  } catch {
    return false;
  }
}

import type { JsonObject, JsonValue } from "../../../../../core/index.ts";

/** The bounded JSON-Schema subset evidence tools use for their object inputs. */
export function automationStudioLlmEvidenceInputMatchesSchema(input: JsonObject, schema: JsonObject): boolean {
  return matches(input, schema, 0);
}

function matches(value: JsonValue, schema: JsonObject, depth: number): boolean {
  if (depth > 20) return false;
  if (Object.keys(schema).some((key) => !SUPPORTED_SCHEMA_KEYS.has(key))) return false;
  if (schema.const !== undefined && !sameJson(value, schema.const)) return false;
  if (schema.enum !== undefined && (!Array.isArray(schema.enum) || !schema.enum.some((candidate) => sameJson(value, candidate)))) return false;
  if (schema.oneOf !== undefined && (!Array.isArray(schema.oneOf) || schema.oneOf.filter((candidate) => isObject(candidate) && matches(value, candidate, depth + 1)).length !== 1)) return false;
  if (schema.anyOf !== undefined && (!Array.isArray(schema.anyOf) || !schema.anyOf.some((candidate) => isObject(candidate) && matches(value, candidate, depth + 1)))) return false;
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
    if (schema.uniqueItems !== undefined && typeof schema.uniqueItems !== "boolean") return false;
    if (schema.uniqueItems === true && value.some((item, index) => value.slice(0, index).some((earlier) => sameJson(item, earlier)))) return false;
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

const SUPPORTED_SCHEMA_KEYS = new Set([
  "const", "enum", "oneOf", "anyOf", "type",
  "minLength", "maxLength", "pattern", "minimum", "maximum",
  "minItems", "maxItems", "uniqueItems", "items",
  "required", "properties", "additionalProperties", "minProperties", "maxProperties"
]);

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
  if (Object.is(left, right)) return true;
  if (Array.isArray(left) || Array.isArray(right)) {
    return Array.isArray(left) && Array.isArray(right) && left.length === right.length
      && left.every((item, index) => sameJson(item, right[index]));
  }
  if (!isObject(left) || !isObject(right)) return false;
  const leftKeys = Object.keys(left).sort();
  const rightKeys = Object.keys(right).sort();
  return leftKeys.length === rightKeys.length
    && leftKeys.every((key, index) => key === rightKeys[index] && sameJson(left[key], right[key]));
}

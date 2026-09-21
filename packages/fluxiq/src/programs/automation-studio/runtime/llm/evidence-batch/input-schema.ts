import type { JsonObject, JsonValue } from "../../../../../core/index.ts";

/**
 * The bounded JSON-Schema subset evidence tools use for their object inputs.
 *
 * The schema is checked against that subset first, on its own and at every
 * depth, and an input is matched only against a schema that passed. A keyword
 * the matcher does not implement, or a form of one it does not implement,
 * therefore refuses every input. Refusing it only where a value reaches it
 * cannot fail closed: `oneOf` counts the branches that match, so a branch
 * dropped for being unreadable can turn two matches, which JSON Schema
 * rejects, into the one match `oneOf` accepts.
 */
export function automationStudioLlmEvidenceInputMatchesSchema(input: JsonObject, schema: JsonObject): boolean {
  return supportedSchema(schema, 0) && matches(input, schema, 0);
}

/** A schema nested deeper than this is refused whole; the matcher never descends past it. */
const MAX_SCHEMA_DEPTH = 20;

function matches(value: JsonValue, schema: JsonObject, depth: number): boolean {
  if (depth > MAX_SCHEMA_DEPTH) return false;
  if (Object.keys(schema).some((key) => !SCHEMA_KEYWORDS.has(key))) return false;
  if (schema.const !== undefined && !sameJson(value, schema.const)) return false;
  if (schema.enum !== undefined && (!Array.isArray(schema.enum) || !schema.enum.some((candidate) => sameJson(value, candidate)))) return false;
  if (schema.oneOf !== undefined && (!Array.isArray(schema.oneOf) || schema.oneOf.filter((candidate) => isObject(candidate) && matches(value, candidate, depth + 1)).length !== 1)) return false;
  if (schema.anyOf !== undefined && (!Array.isArray(schema.anyOf) || !schema.anyOf.some((candidate) => isObject(candidate) && matches(value, candidate, depth + 1)))) return false;
  if (schema.type !== undefined && !matchesType(value, schema.type)) return false;

  if (typeof value === "string") {
    // JSON Schema counts characters, not UTF-16 code units.
    const length = [...value].length;
    if (typeof schema.minLength === "number" && length < schema.minLength) return false;
    if (typeof schema.maxLength === "number" && length > schema.maxLength) return false;
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
      // Own properties only: a key such as `__proto__` must not find a schema on the prototype.
      const property = Object.hasOwn(properties, key) ? properties[key] : undefined;
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

/** Whether the matcher implements every keyword here, in the form it is written, at every depth. */
function supportedSchema(schema: unknown, depth: number): boolean {
  if (depth > MAX_SCHEMA_DEPTH || !isObject(schema)) return false;
  return Object.entries(schema).every(([key, value]) => {
    const form = SCHEMA_KEYWORDS.get(key);
    // An `undefined` keyword is an absent one: JSON drops it and the matcher skips it.
    return form !== undefined && (value === undefined || form(value, depth));
  });
}

type KeywordForm = (value: JsonValue, depth: number) => boolean;

/**
 * Every keyword the matcher implements, each with the only forms of it that it
 * implements. Tuple or boolean `items`, a boolean property schema, a boolean
 * `oneOf`/`anyOf` branch, a malformed `required`, a bound that is not a number
 * of the right kind, and a `pattern` that does not compile are all refused.
 */
const SCHEMA_KEYWORDS: ReadonlyMap<string, KeywordForm> = new Map<string, KeywordForm>([
  ["const", () => true],
  ["enum", (value) => Array.isArray(value)],
  ["oneOf", subschemaList],
  ["anyOf", subschemaList],
  ["type", (value) => Array.isArray(value) ? value.length > 0 && value.every(isTypeName) : isTypeName(value)],
  ["minLength", isCount],
  ["maxLength", isCount],
  ["pattern", (value) => typeof value === "string" && compiles(value)],
  ["minimum", isFiniteNumber],
  ["maximum", isFiniteNumber],
  ["minItems", isCount],
  ["maxItems", isCount],
  ["uniqueItems", (value) => typeof value === "boolean"],
  ["items", (value, depth) => supportedSchema(value, depth + 1)],
  ["required", (value) => Array.isArray(value) && value.every((key) => typeof key === "string")],
  ["properties", (value, depth) => isObject(value) && Object.values(value).every((property) => supportedSchema(property, depth + 1))],
  ["additionalProperties", (value, depth) => typeof value === "boolean" || supportedSchema(value, depth + 1)],
  ["minProperties", isCount],
  ["maxProperties", isCount]
]);

const TYPE_NAMES: ReadonlySet<string> = new Set(["null", "boolean", "object", "array", "number", "integer", "string"]);

function subschemaList(value: JsonValue, depth: number): boolean {
  return Array.isArray(value) && value.length > 0 && value.every((branch) => supportedSchema(branch, depth + 1));
}

function isTypeName(value: unknown): boolean {
  return typeof value === "string" && TYPE_NAMES.has(value);
}

function isCount(value: JsonValue): boolean {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

function isFiniteNumber(value: JsonValue): boolean {
  return typeof value === "number" && Number.isFinite(value);
}

function compiles(pattern: string): boolean {
  try {
    new RegExp(pattern, "u");
    return true;
  } catch {
    return false;
  }
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

/** JSON equality: numbers by value, so `-0` equals `0`, and objects regardless of key order. */
function sameJson(left: unknown, right: unknown): boolean {
  if (left === right) return true;
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

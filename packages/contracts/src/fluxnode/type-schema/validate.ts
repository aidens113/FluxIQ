// The validator for the type subset: a pure function that checks a value against a
// parsed schema and returns every error, each at its JSON Pointer. No model, no I/O:
// a declared output type is checked exactly and at no cost (plan, N3).

import type { JsonValue } from "../../core.ts";
import { findNonJsonPart, formatJsonPointer, jsonEqual } from "../json/index.ts";
import { matchesJsonTypeFormat } from "./formats.ts";
import type { JsonTypeName, JsonTypeSchema } from "./type-schema.ts";

/** Why a value failed its type. One code per keyword, plus `not_json` for a value no schema can describe. */
export const JSON_VALUE_ERROR_CODES = Object.freeze([
  "not_json",
  "type",
  "const",
  "enum",
  "required",
  "additional_property",
  "min_items",
  "max_items",
  "min_length",
  "max_length",
  "format",
  "minimum",
  "maximum",
  "any_of",
  "one_of_none",
  "one_of_many"
] as const);

export type JsonValueErrorCode = (typeof JSON_VALUE_ERROR_CODES)[number];

/**
 * One way a value failed its type: `path` is the JSON Pointer of the failing part
 * (`""` for the value itself, `/listings/2/price` for one field), `code` the keyword
 * that failed, and `message` a sentence for a person.
 */
export type JsonValueError = { path: string; code: JsonValueErrorCode; message: string };

/**
 * Checks `value` against a schema the parser built (`parseJsonTypeSchema`) and
 * returns every error, in document order; an empty list says the value passed.
 * Under a failing `type` the other keywords of that schema are not checked, and a
 * failing `anyOf` or `oneOf` is one error at its own path, since each alternative's
 * errors would be noise.
 */
export function validateJsonValue(schema: JsonTypeSchema, value: unknown): JsonValueError[] {
  const errors: JsonValueError[] = [];
  const at = findNonJsonPart(value);
  if (at !== null) {
    errors.push({ path: formatJsonPointer(at), code: "not_json", message: "Not a JSON value: use null, a boolean, a finite number, a string, an array or a plain object." });
    return errors;
  }
  check(schema, value as JsonValue, [], errors);
  return errors;
}

function kindOf(value: JsonValue): JsonTypeName {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  if (typeof value === "number") return Number.isInteger(value) ? "integer" : "number";
  if (typeof value === "object") return "object";
  return typeof value === "string" ? "string" : "boolean";
}

function matchesType(type: JsonTypeName, value: JsonValue): boolean {
  const kind = kindOf(value);
  return type === kind || (type === "number" && kind === "integer");
}

function push(errors: JsonValueError[], path: Array<string | number>, code: JsonValueErrorCode, message: string): void {
  errors.push({ path: formatJsonPointer(path), code, message });
}

function check(schema: JsonTypeSchema, value: JsonValue, path: Array<string | number>, errors: JsonValueError[]): void {
  if (schema.type !== undefined) {
    const types = Array.isArray(schema.type) ? schema.type : [schema.type];
    if (!types.some((type) => matchesType(type, value))) {
      push(errors, path, "type", `Expected ${types.join(" or ")}, got ${kindOf(value)}.`);
      return;
    }
  }
  if (schema.const !== undefined && !jsonEqual(schema.const, value)) push(errors, path, "const", `Expected exactly ${JSON.stringify(schema.const)}.`);
  if (schema.enum !== undefined && !schema.enum.some((option) => jsonEqual(option, value))) push(errors, path, "enum", `Expected one of ${schema.enum.map((option) => JSON.stringify(option)).join(", ")}.`);
  if (typeof value === "string") checkString(schema, value, path, errors);
  else if (typeof value === "number") checkNumber(schema, value, path, errors);
  else if (Array.isArray(value)) checkArray(schema, value, path, errors);
  else if (value !== null && typeof value === "object") checkObject(schema, value, path, errors);
  checkAlternatives(schema, value, path, errors);
}

function checkString(schema: JsonTypeSchema, value: string, path: Array<string | number>, errors: JsonValueError[]): void {
  const length = [...value].length;
  if (schema.minLength !== undefined && length < schema.minLength) push(errors, path, "min_length", `Expected at least ${schema.minLength} characters, got ${length}.`);
  if (schema.maxLength !== undefined && length > schema.maxLength) push(errors, path, "max_length", `Expected at most ${schema.maxLength} characters, got ${length}.`);
  if (schema.format !== undefined && !matchesJsonTypeFormat(schema.format, value)) push(errors, path, "format", `Expected a ${schema.format}.`);
}

function checkNumber(schema: JsonTypeSchema, value: number, path: Array<string | number>, errors: JsonValueError[]): void {
  if (schema.minimum !== undefined && value < schema.minimum) push(errors, path, "minimum", `Expected at least ${schema.minimum}, got ${value}.`);
  if (schema.maximum !== undefined && value > schema.maximum) push(errors, path, "maximum", `Expected at most ${schema.maximum}, got ${value}.`);
}

function checkArray(schema: JsonTypeSchema, value: JsonValue[], path: Array<string | number>, errors: JsonValueError[]): void {
  if (schema.minItems !== undefined && value.length < schema.minItems) push(errors, path, "min_items", `Expected at least ${schema.minItems} items, got ${value.length}.`);
  if (schema.maxItems !== undefined && value.length > schema.maxItems) push(errors, path, "max_items", `Expected at most ${schema.maxItems} items, got ${value.length}.`);
  const items = schema.items;
  if (items !== undefined) value.forEach((item, index) => check(items, item, [...path, index], errors));
}

function checkObject(schema: JsonTypeSchema, value: { [key: string]: JsonValue }, path: Array<string | number>, errors: JsonValueError[]): void {
  const properties = schema.properties ?? {};
  for (const name of schema.required ?? []) {
    if (!Object.hasOwn(value, name)) push(errors, [...path, name], "required", `"${name}" is required.`);
  }
  for (const key of Object.keys(value)) {
    const item = value[key] as JsonValue;
    const declared = Object.hasOwn(properties, key) ? properties[key] : undefined;
    if (declared !== undefined) check(declared, item, [...path, key], errors);
    else if (schema.additionalProperties === false) push(errors, [...path, key], "additional_property", `"${key}" is not a declared property.`);
    else if (typeof schema.additionalProperties === "object") check(schema.additionalProperties, item, [...path, key], errors);
  }
}

function passes(schema: JsonTypeSchema, value: JsonValue, path: Array<string | number>): boolean {
  const errors: JsonValueError[] = [];
  check(schema, value, path, errors);
  return errors.length === 0;
}

function checkAlternatives(schema: JsonTypeSchema, value: JsonValue, path: Array<string | number>, errors: JsonValueError[]): void {
  if (schema.anyOf !== undefined && !schema.anyOf.some((option) => passes(option, value, path))) {
    push(errors, path, "any_of", `Matches none of the ${schema.anyOf.length} allowed shapes.`);
  }
  if (schema.oneOf !== undefined) {
    const matched = schema.oneOf.filter((option) => passes(option, value, path)).length;
    if (matched === 0) push(errors, path, "one_of_none", `Matches none of the ${schema.oneOf.length} allowed shapes.`);
    else if (matched > 1) push(errors, path, "one_of_many", `Matches ${matched} of the allowed shapes; exactly one must match.`);
  }
}

// The parser for the type subset (`./type-schema.ts`): it builds a fresh schema from an
// untrusted value, or refuses every keyword outside the subset with the reason and
// what to write instead. Issue codes are prefixed `type_schema.`.

import type { JsonValue } from "../../core.ts";
import { finishRawParse, zodFromParser, type FluxNodeIssuePath, type FluxNodeParseResult, type FluxNodeRawIssue } from "../issue/index.ts";
import { findNonJsonPart, jsonEqual } from "../json/index.ts";
import { JSON_TYPE_FORMATS, JSON_TYPE_NAMES, JSON_TYPE_SCHEMA_LIMITS as LIMITS, type JsonTypeFormat, type JsonTypeName, type JsonTypeSchema } from "./type-schema.ts";

type Kind = "object" | "array" | "string" | "number";

/** The keywords that apply to one kind of value, and the kind `type` must name for them. */
const KEYWORD_KIND: Readonly<Record<string, Kind>> = Object.freeze({
  properties: "object",
  required: "object",
  additionalProperties: "object",
  items: "array",
  minItems: "array",
  maxItems: "array",
  minLength: "string",
  maxLength: "string",
  format: "string",
  minimum: "number",
  maximum: "number"
});

const GENERAL_KEYWORDS: ReadonlySet<string> = new Set(["type", "enum", "const", "anyOf", "oneOf", "title", "description", "default", "examples"]);

/** What to write instead of a JSON Schema keyword the subset leaves out. */
const INSTEAD: Readonly<Record<string, string>> = Object.freeze({
  nullable: 'list "null" in type instead, as ["string", "null"]',
  pattern: "use format, enum, or a check written in code instead",
  $ref: "write the referenced schema out in full instead",
  $defs: "write each schema out in full where it is used instead",
  definitions: "write each schema out in full where it is used instead",
  allOf: "merge the schemas into one instead",
  not: "use enum or a check written in code instead",
  if: "use anyOf or oneOf instead",
  exclusiveMinimum: "use minimum instead",
  exclusiveMaximum: "use maximum instead",
  prefixItems: "use items with one schema for every element instead",
  uniqueItems: "use a check written in code instead",
  patternProperties: "declare each property under properties instead"
});

const KIND_OF_TYPE: Readonly<Record<JsonTypeName, Kind | null>> = Object.freeze({
  string: "string",
  number: "number",
  integer: "number",
  boolean: null,
  object: "object",
  array: "array",
  null: null
});

type State = { issues: FluxNodeRawIssue[]; schemas: number; tooLarge: boolean };

/** Parses an untrusted value into a schema in the subset, or every reason it is not one. */
export function parseJsonTypeSchema(value: unknown): FluxNodeParseResult<JsonTypeSchema> {
  const issues: FluxNodeRawIssue[] = [];
  return finishRawParse(readJsonTypeSchema(value, issues), issues);
}

/** The same parser as a zod schema, for a type that sits inside another contract. */
export const jsonTypeSchemaSchema = zodFromParser(readJsonTypeSchema);

/** The parser over a raw issue list; `$schema` is accepted at the root only, and dropped. */
export function readJsonTypeSchema(value: unknown, issues: FluxNodeRawIssue[]): JsonTypeSchema | null {
  const before = issues.length;
  const state: State = { issues, schemas: 0, tooLarge: false };
  const schema = readSchema(value, [], 0, state);
  return issues.length === before ? schema : null;
}

function add(state: State, path: FluxNodeIssuePath, code: string, message: string): void {
  state.issues.push({ path, code: `type_schema.${code}`, message });
}

function isPlain(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function readSchema(value: unknown, path: FluxNodeIssuePath, depth: number, state: State): JsonTypeSchema {
  const schema: JsonTypeSchema = {};
  if (depth > LIMITS.maxDepth) {
    add(state, path, "too_deep", `Schemas nest more than ${LIMITS.maxDepth} deep here.`);
    return schema;
  }
  state.schemas += 1;
  if (state.schemas > LIMITS.maxSchemas) {
    if (!state.tooLarge) add(state, path, "too_large", `The type holds more than ${LIMITS.maxSchemas} schemas.`);
    state.tooLarge = true;
    return schema;
  }
  if (typeof value === "boolean") {
    add(state, path, "not_object", "A schema is an object; write {} to accept any value.");
    return schema;
  }
  if (!isPlain(value)) {
    add(state, path, "not_object", "A schema is a plain object, such as { \"type\": \"string\" }.");
    return schema;
  }
  const types = readType(value, path, state, schema);
  for (const key of Object.keys(value)) {
    if (key === "$schema" && depth === 0) continue;
    if (GENERAL_KEYWORDS.has(key)) continue;
    const kind = KEYWORD_KIND[key];
    if (kind === undefined) {
      const instead = INSTEAD[key];
      const message = instead === undefined ? `"${key}" is not a supported keyword. Supported: type, properties, required, additionalProperties, items, enum, const, anyOf, oneOf, format, minimum, maximum, minLength, maxLength, minItems, maxItems, title, description, default, examples.` : `"${key}" is not supported; ${instead}.`;
      add(state, [...path, key], "unknown_keyword", message);
    } else if (types === null) {
      add(state, [...path, key], "keyword_needs_type", `"${key}" applies to ${kind === "number" ? "numbers" : `${kind}s`}; add "type": "${kind}".`);
    } else if (!types.some((type) => KIND_OF_TYPE[type] === kind)) {
      add(state, [...path, key], "keyword_type_mismatch", `"${key}" applies to ${kind === "number" ? "numbers" : `${kind}s`}, but type is ${JSON.stringify(value["type"])}.`);
    }
  }
  readAnnotations(value, path, state, schema);
  readValues(value, path, state, schema);
  readAlternatives(value, path, depth, state, schema);
  readObjectKeywords(value, path, depth, state, schema);
  readArrayKeywords(value, path, depth, state, schema);
  readScalarKeywords(value, path, state, schema);
  return schema;
}

function readType(value: Record<string, unknown>, path: FluxNodeIssuePath, state: State, schema: JsonTypeSchema): JsonTypeName[] | null {
  if (!("type" in value)) return null;
  const raw = value["type"];
  const isName = (item: unknown): item is JsonTypeName => typeof item === "string" && (JSON_TYPE_NAMES as readonly string[]).includes(item);
  const named = `Use one of ${JSON_TYPE_NAMES.join(", ")}, or a list of them.`;
  if (isName(raw)) {
    schema.type = raw;
    return [raw];
  }
  if (!Array.isArray(raw) || raw.length === 0) {
    add(state, [...path, "type"], "bad_type", `type must name a kind of value. ${named}`);
    return [];
  }
  const names: JsonTypeName[] = [];
  raw.forEach((item, index) => {
    if (!isName(item)) add(state, [...path, "type", index], "bad_type", `${JSON.stringify(item)} is not a kind of value. ${named}`);
    else if (names.includes(item)) add(state, [...path, "type", index], "duplicate", `"${item}" is listed twice.`);
    else names.push(item);
  });
  schema.type = names;
  return names;
}

function readText(value: unknown, path: FluxNodeIssuePath, state: State): string | undefined {
  if (typeof value === "string" && value.length <= LIMITS.maxTextLength) return value;
  add(state, path, "bad_value", `Expected text of at most ${LIMITS.maxTextLength} characters.`);
  return undefined;
}

function readJson(value: unknown, path: FluxNodeIssuePath, state: State): JsonValue | undefined {
  const at = findNonJsonPart(value);
  if (at === null) return value as JsonValue;
  add(state, [...path, ...at], "not_json", "Not a JSON value.");
  return undefined;
}

function readAnnotations(value: Record<string, unknown>, path: FluxNodeIssuePath, state: State, schema: JsonTypeSchema): void {
  if ("title" in value) {
    const title = readText(value["title"], [...path, "title"], state);
    if (title !== undefined) schema.title = title;
  }
  if ("description" in value) {
    const description = readText(value["description"], [...path, "description"], state);
    if (description !== undefined) schema.description = description;
  }
  if ("default" in value) {
    const fallback = readJson(value["default"], [...path, "default"], state);
    if (fallback !== undefined) schema.default = fallback;
  }
  if ("examples" in value) {
    const examples = value["examples"];
    if (!Array.isArray(examples)) add(state, [...path, "examples"], "bad_value", "examples must be a list of values.");
    else {
      const read = readJson(examples, [...path, "examples"], state);
      if (Array.isArray(read)) schema.examples = read;
    }
  }
}

function readValues(value: Record<string, unknown>, path: FluxNodeIssuePath, state: State, schema: JsonTypeSchema): void {
  if ("const" in value) {
    const constant = readJson(value["const"], [...path, "const"], state);
    if (constant !== undefined) schema.const = constant;
  }
  if (!("enum" in value)) return;
  const values = value["enum"];
  if (!Array.isArray(values) || values.length === 0 || values.length > LIMITS.maxEnumValues) {
    add(state, [...path, "enum"], "bad_value", `enum must list 1 to ${LIMITS.maxEnumValues} values.`);
    return;
  }
  const kept: JsonValue[] = [];
  values.forEach((item, index) => {
    const read = readJson(item, [...path, "enum", index], state);
    if (read === undefined) return;
    if (kept.some((other) => jsonEqual(other, read))) add(state, [...path, "enum", index], "duplicate", "This value is listed twice.");
    else kept.push(read);
  });
  schema.enum = kept;
}

function readSchemaList(value: unknown, path: FluxNodeIssuePath, depth: number, state: State, keyword: string): JsonTypeSchema[] | undefined {
  if (!Array.isArray(value) || value.length === 0 || value.length > LIMITS.maxAlternatives) {
    add(state, path, "bad_value", `${keyword} must list 1 to ${LIMITS.maxAlternatives} schemas.`);
    return undefined;
  }
  return value.map((item, index) => readSchema(item, [...path, index], depth + 1, state));
}

function readAlternatives(value: Record<string, unknown>, path: FluxNodeIssuePath, depth: number, state: State, schema: JsonTypeSchema): void {
  if ("anyOf" in value) {
    const anyOf = readSchemaList(value["anyOf"], [...path, "anyOf"], depth, state, "anyOf");
    if (anyOf !== undefined) schema.anyOf = anyOf;
  }
  if ("oneOf" in value) {
    const oneOf = readSchemaList(value["oneOf"], [...path, "oneOf"], depth, state, "oneOf");
    if (oneOf !== undefined) schema.oneOf = oneOf;
  }
}

function readObjectKeywords(value: Record<string, unknown>, path: FluxNodeIssuePath, depth: number, state: State, schema: JsonTypeSchema): void {
  const declared = new Set<string>();
  if ("properties" in value) {
    const properties = value["properties"];
    if (!isPlain(properties) || Object.keys(properties).length > LIMITS.maxProperties) {
      add(state, [...path, "properties"], "bad_value", `properties must be an object of at most ${LIMITS.maxProperties} schemas, keyed by name.`);
    } else {
      const read: { [name: string]: JsonTypeSchema } = {};
      for (const name of Object.keys(properties)) {
        declared.add(name);
        // Defined, not assigned, so a property named "__proto__" stays a property.
        Object.defineProperty(read, name, { value: readSchema(properties[name], [...path, "properties", name], depth + 1, state), enumerable: true, writable: true, configurable: true });
      }
      schema.properties = read;
    }
  }
  if ("required" in value) {
    const required = value["required"];
    if (!Array.isArray(required)) add(state, [...path, "required"], "bad_value", "required must be a list of property names.");
    else {
      const names: string[] = [];
      required.forEach((name, index) => {
        if (typeof name !== "string") add(state, [...path, "required", index], "bad_value", "A required entry is a property name.");
        else if (names.includes(name)) add(state, [...path, "required", index], "duplicate", `"${name}" is listed twice.`);
        else if (!declared.has(name)) add(state, [...path, "required", index], "required_not_declared", `"${name}" is required but not declared under properties; declare it there.`);
        else names.push(name);
      });
      schema.required = names;
    }
  }
  if ("additionalProperties" in value) {
    const extra = value["additionalProperties"];
    schema.additionalProperties = typeof extra === "boolean" ? extra : readSchema(extra, [...path, "additionalProperties"], depth + 1, state);
  }
}

function readArrayKeywords(value: Record<string, unknown>, path: FluxNodeIssuePath, depth: number, state: State, schema: JsonTypeSchema): void {
  if ("items" in value) {
    const items = value["items"];
    if (Array.isArray(items)) add(state, [...path, "items"], "unknown_keyword", "A list of item schemas (a tuple) is not supported; give items one schema for every element.");
    else schema.items = readSchema(items, [...path, "items"], depth + 1, state);
  }
  readBounds(value, path, state, schema, "minItems", "maxItems", true);
}

function readScalarKeywords(value: Record<string, unknown>, path: FluxNodeIssuePath, state: State, schema: JsonTypeSchema): void {
  readBounds(value, path, state, schema, "minLength", "maxLength", true);
  readBounds(value, path, state, schema, "minimum", "maximum", false);
  if (!("format" in value)) return;
  const format = value["format"];
  if (typeof format === "string" && (JSON_TYPE_FORMATS as readonly string[]).includes(format)) schema.format = format as JsonTypeFormat;
  else add(state, [...path, "format"], "unknown_format", `${JSON.stringify(format)} is not a supported format. Use one of ${JSON_TYPE_FORMATS.join(", ")}.`);
}

type BoundKey = "minItems" | "maxItems" | "minLength" | "maxLength" | "minimum" | "maximum";

function readBounds(value: Record<string, unknown>, path: FluxNodeIssuePath, state: State, schema: JsonTypeSchema, low: BoundKey, high: BoundKey, count: boolean): void {
  const read = (key: BoundKey): number | undefined => {
    if (!(key in value)) return undefined;
    const bound = value[key];
    const valid = typeof bound === "number" && (count ? Number.isSafeInteger(bound) && bound >= 0 : Number.isFinite(bound));
    if (valid) return bound;
    add(state, [...path, key], "bad_value", count ? `${key} must be a whole number of at least 0.` : `${key} must be a finite number.`);
    return undefined;
  };
  const lowValue = read(low);
  const highValue = read(high);
  if (lowValue !== undefined) schema[low] = lowValue;
  if (highValue !== undefined) schema[high] = highValue;
  if (lowValue !== undefined && highValue !== undefined && lowValue > highValue) add(state, [...path, low], "empty_range", `${low} is above ${high}, so no value could pass.`);
}

// The canonical form of a type, for identity: two schemas that mean the same give the
// same form, so a spec hash does not change when only the order of a set changed.

import type { JsonObject, JsonValue } from "../../core.ts";
import { canonicalJson } from "../json/index.ts";
import type { JsonTypeSchema } from "./type-schema.ts";

/**
 * The schema as a JSON value with every set in one order: `type` sorted (a list of one
 * becomes its name), `required` sorted, and `enum`, `anyOf` and `oneOf` sorted by
 * their canonical text, all the way down. Lists whose order means something
 * (`examples`) keep it. Pass the result to `canonicalJson` for text.
 */
export function canonicalJsonTypeSchema(schema: JsonTypeSchema): JsonObject {
  const form: JsonObject = {};
  if (schema.type !== undefined) {
    const types = Array.isArray(schema.type) ? [...new Set(schema.type)].sort() : [schema.type];
    form["type"] = types.length === 1 ? (types[0] as string) : types;
  }
  if (schema.title !== undefined) form["title"] = schema.title;
  if (schema.description !== undefined) form["description"] = schema.description;
  if (schema.default !== undefined) form["default"] = schema.default;
  if (schema.examples !== undefined) form["examples"] = schema.examples;
  if (schema.enum !== undefined) form["enum"] = sortedByText(schema.enum);
  if (schema.const !== undefined) form["const"] = schema.const;
  if (schema.anyOf !== undefined) form["anyOf"] = sortedByText(schema.anyOf.map(canonicalJsonTypeSchema));
  if (schema.oneOf !== undefined) form["oneOf"] = sortedByText(schema.oneOf.map(canonicalJsonTypeSchema));
  if (schema.properties !== undefined) {
    const properties: JsonObject = {};
    for (const name of Object.keys(schema.properties)) {
      const property = schema.properties[name] as JsonTypeSchema;
      Object.defineProperty(properties, name, { value: canonicalJsonTypeSchema(property), enumerable: true, writable: true, configurable: true });
    }
    form["properties"] = properties;
  }
  if (schema.required !== undefined) form["required"] = [...schema.required].sort();
  if (schema.additionalProperties !== undefined) form["additionalProperties"] = typeof schema.additionalProperties === "boolean" ? schema.additionalProperties : canonicalJsonTypeSchema(schema.additionalProperties);
  if (schema.items !== undefined) form["items"] = canonicalJsonTypeSchema(schema.items);
  const bounds = ["minItems", "maxItems", "minLength", "maxLength", "minimum", "maximum"] as const;
  for (const bound of bounds) {
    const value = schema[bound];
    if (value !== undefined) form[bound] = value;
  }
  if (schema.format !== undefined) form["format"] = schema.format;
  return form;
}

function sortedByText(values: JsonValue[]): JsonValue[] {
  return values
    .map((value) => ({ value, text: canonicalJson(value) }))
    .sort((left, right) => (left.text < right.text ? -1 : left.text > right.text ? 1 : 0))
    .map((entry) => entry.value);
}

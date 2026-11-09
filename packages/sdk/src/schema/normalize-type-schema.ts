// Prepares emitted JSON Schema for the contracts' parser. The one rule: where a
// `pattern` sits beside a `format`, the pattern is dropped (the format carries its own
// rule, and the subset refuses patterns, which a server cannot check safely); a bare
// `pattern` is an error that suggests a format.

import { unsupportedType } from "./unsupported.ts";

type Json = { [key: string]: unknown };

const SUBSCHEMA_LISTS = ["anyOf", "oneOf"] as const;

function isObject(value: unknown): value is Json {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** A copy of `schema` with every `pattern` beside a `format` removed. Throws `invalid_schema` on a bare one. `path` prefixes refusals. */
export function normalizeTypeSchema(schema: unknown, path = ""): unknown {
  if (!isObject(schema)) return schema;
  const out: Json = { ...schema };
  if ("pattern" in out) {
    if (out.format === undefined) {
      unsupportedType(path, 'a bare "pattern" is not supported.', 'Use a format ("email", "uri", "date", "date-time"), an enum, or minLength and maxLength.');
    }
    delete out.pattern;
  }
  if (isObject(out.properties)) {
    const properties: Json = {};
    for (const [name, member] of Object.entries(out.properties)) properties[name] = normalizeTypeSchema(member, `${path}/properties/${name}`);
    out.properties = properties;
  }
  if (isObject(out.items)) out.items = normalizeTypeSchema(out.items, `${path}/items`);
  if (isObject(out.additionalProperties)) out.additionalProperties = normalizeTypeSchema(out.additionalProperties, `${path}/additionalProperties`);
  for (const keyword of SUBSCHEMA_LISTS) {
    const list = out[keyword];
    if (Array.isArray(list)) out[keyword] = list.map((member, index) => normalizeTypeSchema(member, `${path}/${keyword}/${index}`));
  }
  return out;
}

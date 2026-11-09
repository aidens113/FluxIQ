// The exact types a developer may declare for a FluxNode's or a Flow's inputs and
// outputs, and for a data pipeline's validate step: a subset of JSON Schema (draft
// 2020-12) whose every keyword is checked, at no model cost (plan, N3).
//
// The subset keeps JSON Schema's meaning wherever it keeps a keyword, so a schema in
// it validates the same here as in any JSON Schema validator, with one deliberate
// difference: `format` is asserted, not an annotation. Like JSON Schema,
// `additionalProperties` allows extra keys unless it says otherwise.

import type { JsonValue } from "../../core.ts";

/** The value kinds `type` may name. `integer` is a number with no fractional part. */
export const JSON_TYPE_NAMES = Object.freeze(["string", "number", "integer", "boolean", "object", "array", "null"] as const);

export type JsonTypeName = (typeof JSON_TYPE_NAMES)[number];

/**
 * The formats a string may be held to, each asserted:
 *
 * - `date-time`: RFC 3339, such as `2026-11-09T14:30:00Z` or `...+01:00`;
 * - `date`: a calendar date, `2026-11-09`;
 * - `uri`: an absolute URI with a scheme and no whitespace;
 * - `email`: an address with a local part and a dotted domain.
 */
export const JSON_TYPE_FORMATS = Object.freeze(["date-time", "date", "uri", "email"] as const);

export type JsonTypeFormat = (typeof JSON_TYPE_FORMATS)[number];

/**
 * A schema in the supported subset. `{}` accepts any JSON value. A value that may be
 * null says so in `type`, as `["string", "null"]`; there is no `nullable`.
 *
 * - Every value: `type`, `enum`, `const`, `anyOf`, `oneOf`, and the annotations
 *   `title`, `description`, `default` and `examples`.
 * - Objects: `properties`, `required` (each name declared in `properties`),
 *   `additionalProperties` (a boolean or a schema).
 * - Arrays: `items` (one schema for every element), `minItems`, `maxItems`.
 * - Strings: `minLength`, `maxLength` (in code points), `format`.
 * - Numbers and integers: `minimum`, `maximum`, both inclusive.
 *
 * A keyword for one kind of value needs `type` to name that kind: `{ minLength: 3 }`
 * is refused, `{ type: "string", minLength: 3 }` is not.
 */
export type JsonTypeSchema = {
  type?: JsonTypeName | JsonTypeName[];
  title?: string;
  description?: string;
  default?: JsonValue;
  examples?: JsonValue[];
  enum?: JsonValue[];
  const?: JsonValue;
  anyOf?: JsonTypeSchema[];
  oneOf?: JsonTypeSchema[];
  properties?: { [name: string]: JsonTypeSchema };
  required?: string[];
  additionalProperties?: boolean | JsonTypeSchema;
  items?: JsonTypeSchema;
  minItems?: number;
  maxItems?: number;
  minLength?: number;
  maxLength?: number;
  format?: JsonTypeFormat;
  minimum?: number;
  maximum?: number;
};

/**
 * Bounds on a schema, so a hostile one cannot exhaust a server: how deep schemas may
 * nest, how many schemas one document may hold in all, how many properties, enum
 * values and alternatives one schema may list, and how long a title or description
 * may be.
 */
export const JSON_TYPE_SCHEMA_LIMITS = Object.freeze({
  maxDepth: 32,
  maxSchemas: 4096,
  maxProperties: 512,
  maxEnumValues: 1024,
  maxAlternatives: 64,
  maxTextLength: 2000
});

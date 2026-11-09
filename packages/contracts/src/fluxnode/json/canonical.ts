// Canonical JSON text: the same value always gives the same text, whatever order its
// object keys were written in. Spec hashes and other identities are computed over it.

import type { JsonValue } from "../../core.ts";

/**
 * Serialises a JSON value with object keys sorted by UTF-16 code unit order and no
 * whitespace. Arrays keep their order; numbers and strings are written as
 * `JSON.stringify` writes them, so `-0` is `0`.
 */
export function canonicalJson(value: JsonValue): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((item) => canonicalJson(item)).join(",")}]`;
  const keys = Object.keys(value).sort();
  return `{${keys.map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key] as JsonValue)}`).join(",")}}`;
}

// A client's opaque, durable target for a control (P6, CC7, t799): the
// `controlRef` of a closed layer's way out (`./cleared-layers.ts`) and of an
// obstruction's ways out (`./obstruction-of.ts`). Core never reads inside it;
// it hands it back unchanged as the parameters of the press it runs or
// builds.
//
// It becomes a node parameter, and a parameter that holds `{ $state: ... }`
// is resolved from the run's own state (`../../../nodes/parameter-bindings.ts`),
// so an untrusted reference holding a `$`-key could have the run read its own
// values into the press it sends back. Such a reference is refused whole.

import type { JsonObject } from "../../../../../core/index.ts";

/** The most a reference may weigh, as JSON: the client's own bound. */
const REF_MAX_BYTES = 8 * 1024;

/** How deep a reference may nest before it is refused rather than walked. */
const REF_MAX_DEPTH = 16;

/**
 * The reference as a fresh JSON object, or nothing when `value` is not a
 * plain JSON object (strings, finite numbers, booleans, null, lists and plain
 * objects all the way down), nests past the bound, holds a key that starts
 * with `$` at any depth (header), or weighs more than 8 KB as JSON.
 */
export function automationStudioOpaqueRefOf(value: unknown): JsonObject | undefined {
  if (!isPlainObject(value) || !isInertJson(value, 0)) return undefined;
  // Every value below is JSON by now, so the text is always written.
  const text = JSON.stringify(value);
  if (new TextEncoder().encode(text).length > REF_MAX_BYTES) return undefined;
  return JSON.parse(text) as JsonObject;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value) as unknown;
  return prototype === Object.prototype || prototype === null;
}

function isInertJson(value: unknown, depth: number): boolean {
  if (value === null || typeof value === "string" || typeof value === "boolean") return true;
  if (typeof value === "number") return Number.isFinite(value);
  if (depth >= REF_MAX_DEPTH) return false;
  if (Array.isArray(value)) return value.every((element) => isInertJson(element, depth + 1));
  if (!isPlainObject(value)) return false;
  return Object.entries(value).every(([key, nested]) => !key.startsWith("$") && isInertJson(nested, depth + 1));
}

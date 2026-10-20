// A deep-frozen JSON copy of a structured value (source test T04): once taken,
// later mutation of the live object cannot reach it. It keeps exactly what the
// wire would carry -- key order, explicit null, empty collections, unknown
// fields -- and leaves out a property whose value is `undefined`, which the
// wire also omits. Anything the wire would silently change (a function, a
// non-finite number, a Date or Map, a cycle, an array hole) is refused with
// the path that held it, never quietly converted.

import type { ClientGatewayTraceJsonValue } from "./types.ts";

/** Throws, naming the path, when `value` is not plain JSON data. */
export function cloneClientGatewayTraceJson(value: unknown): ClientGatewayTraceJsonValue {
  return cloneValue(value, "", new Set<object>());
}

function cloneValue(value: unknown, path: string, ancestors: Set<object>): ClientGatewayTraceJsonValue {
  if (value === null) return null;
  if (typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error(`trace payload at "${path}" is a non-finite number`);
    return value;
  }
  if (typeof value !== "object") throw new Error(`trace payload at "${path}" is a ${typeof value}, not JSON data`);
  if (ancestors.has(value)) throw new Error(`trace payload at "${path}" is a cycle`);
  ancestors.add(value);
  const copy = Array.isArray(value) ? cloneArray(value, path, ancestors) : cloneRecord(value, path, ancestors);
  ancestors.delete(value);
  return copy;
}

function cloneArray(value: readonly unknown[], path: string, ancestors: Set<object>): ClientGatewayTraceJsonValue {
  const items: ClientGatewayTraceJsonValue[] = [];
  for (let index = 0; index < value.length; index += 1) {
    if (!(index in value) || value[index] === undefined) throw new Error(`trace payload at "${path}/${index}" is a hole or undefined`);
    items.push(cloneValue(value[index], `${path}/${index}`, ancestors));
  }
  return Object.freeze(items);
}

function cloneRecord(value: object, path: string, ancestors: Set<object>): ClientGatewayTraceJsonValue {
  const prototype: unknown = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) throw new Error(`trace payload at "${path}" is not a plain object`);
  const entries: [string, ClientGatewayTraceJsonValue][] = [];
  for (const [key, field] of Object.entries(value)) {
    if (field === undefined) continue;
    entries.push([key, cloneValue(field, `${path}/${key}`, ancestors)]);
  }
  // fromEntries defines own data properties, so a "__proto__" key stays a key.
  return Object.freeze(Object.fromEntries(entries));
}

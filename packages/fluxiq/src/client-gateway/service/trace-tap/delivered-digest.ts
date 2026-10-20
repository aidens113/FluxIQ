// The digest of a value Core delivered (traces and offline trials, P3): the
// lower-case hex SHA-256 of its canonical JSON -- object keys sorted by code
// point, arrays in order, a property whose value is `undefined` left out as the
// wire leaves it out -- so a replay is compared on what Core derived, not only
// on what it received. A value that is not JSON data (a cycle, a function, a
// non-finite number, a class instance) has no digest and reads `unhashable`;
// the tap never throws into the gateway.

import { createHash } from "node:crypto";

/** What a value that is not JSON data reads as, in place of a digest. */
const UNHASHABLE = "unhashable";

export function clientGatewayTraceDeliveredDigest(value: unknown): string {
  let text: string;
  try {
    text = canonical(value, new Set<object>());
  } catch {
    /* best-effort: a value that is not JSON data has no canonical form, so it is named unhashable instead */
    return UNHASHABLE;
  }
  return createHash("sha256").update(text).digest("hex");
}

function canonical(value: unknown, ancestors: Set<object>): string {
  if (value === null || typeof value === "string" || typeof value === "boolean") return JSON.stringify(value);
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error("a non-finite number is not JSON data");
    return JSON.stringify(value);
  }
  if (typeof value !== "object") throw new Error(`a ${typeof value} is not JSON data`);
  if (ancestors.has(value)) throw new Error("a cycle is not JSON data");
  ancestors.add(value);
  const text = Array.isArray(value) ? canonicalArray(value, ancestors) : canonicalRecord(value, ancestors);
  ancestors.delete(value);
  return text;
}

function canonicalArray(value: readonly unknown[], ancestors: Set<object>): string {
  const items: string[] = [];
  for (const item of value) items.push(item === undefined ? "null" : canonical(item, ancestors));
  return `[${items.join(",")}]`;
}

function canonicalRecord(value: object, ancestors: Set<object>): string {
  const prototype: unknown = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) throw new Error("only a plain object is JSON data");
  const entries = Object.entries(value).filter((entry) => entry[1] !== undefined);
  entries.sort((left, right) => compareCodePoints(left[0], right[0]));
  const fields = entries.map(([key, field]) => `${JSON.stringify(key)}:${canonical(field, ancestors)}`);
  return `{${fields.join(",")}}`;
}

function compareCodePoints(left: string, right: string): number {
  const a = Array.from(left, (char) => char.codePointAt(0) ?? 0);
  const b = Array.from(right, (char) => char.codePointAt(0) ?? 0);
  for (let index = 0; index < Math.min(a.length, b.length); index += 1) {
    const difference = (a[index] ?? 0) - (b[index] ?? 0);
    if (difference !== 0) return difference;
  }
  return a.length - b.length;
}

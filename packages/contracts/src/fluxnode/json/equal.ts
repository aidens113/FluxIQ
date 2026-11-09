// Deep equality of two JSON values, as `enum` and `const` compare them: object key
// order does not matter, array order does, and 1 equals 1.0.

import type { JsonValue } from "../../core.ts";

/** True when `left` and `right` are the same JSON value. */
export function jsonEqual(left: JsonValue, right: JsonValue): boolean {
  if (left === right) return true;
  if (typeof left !== "object" || typeof right !== "object" || left === null || right === null) return false;
  if (Array.isArray(left) || Array.isArray(right)) {
    if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) return false;
    return left.every((item, index) => jsonEqual(item, right[index] as JsonValue));
  }
  const leftKeys = Object.keys(left);
  if (leftKeys.length !== Object.keys(right).length) return false;
  return leftKeys.every((key) => Object.hasOwn(right, key) && jsonEqual(left[key] as JsonValue, right[key] as JsonValue));
}

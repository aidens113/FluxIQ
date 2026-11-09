import type { JsonValue } from "../../../../../core/index.ts";

/** False for null, false, 0 and ""; true for everything else (an empty list is true). */
export function isTruthy(value: JsonValue): boolean {
  return !(value === null || value === false || value === 0 || value === "");
}

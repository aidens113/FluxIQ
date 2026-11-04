// The small checks the task-attempt parsers share. Internal to this directory: not
// re-exported.

import { AUTOMATION_STUDIO_TASK_ATTEMPT_LIMITS as LIMITS } from "./limits.ts";

/** True for an object literal or a null-prototype object; false for arrays, class instances and primitives. */
export function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

/** True when `value` has no key outside `keys`. This is what keeps anything a record does not name off it. */
export function hasOnlyKeys(value: Record<string, unknown>, keys: ReadonlySet<string>): boolean {
  return Object.keys(value).every((key) => keys.has(key));
}

export function isId(value: unknown): value is string {
  return typeof value === "string" && LIMITS.idPattern.test(value);
}

export function isDigest(value: unknown): value is string {
  return typeof value === "string" && LIMITS.digestPattern.test(value);
}

export function isCode(value: unknown): value is string {
  return typeof value === "string" && LIMITS.codePattern.test(value);
}

/** A whole number of things, or of epoch milliseconds. */
export function isCount(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

/** A finite amount of money, zero or more. */
export function isAmount(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

export function isMemberOf<T extends string>(list: readonly T[], value: unknown): value is T {
  return typeof value === "string" && (list as readonly string[]).includes(value);
}

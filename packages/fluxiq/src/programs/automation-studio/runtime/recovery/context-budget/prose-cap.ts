import type { JsonValue } from "../../../../../core/index.ts";

/**
 * Keys whose string is identity rather than prose, and is never shortened: an id
 * cut in half names nothing, and a repair that cannot name the node or edge it
 * means cannot author a change to it. Everything that ends in `Id` or `Ids` is
 * one, plus the few identity keys that do not.
 */
const IDENTITY_KEYS: ReadonlySet<string> = new Set(["from", "to", "fromPort", "toPort", "code", "category", "stage", "status", "route", "schemaVersion", "failureCode", "failureCategory"]);

function isIdentityKey(key: string | undefined): boolean {
  return key !== undefined && (IDENTITY_KEYS.has(key) || /ids?$/iu.test(key));
}

/**
 * `value` with every prose string longer than `maxLength` cut to it, ending in
 * an ellipsis so a reader can tell a sentence was shortened rather than written
 * short. Identity strings are left whole wherever they sit, including inside a
 * list under an identity key (`incomingEdgeIds`).
 */
export function automationStudioCappedProse<Value extends JsonValue>(value: Value, maxLength: number, key?: string): Value {
  if (typeof value === "string") {
    return (value.length > maxLength && !isIdentityKey(key) ? `${value.slice(0, Math.max(1, maxLength - 1))}…` : value) as Value;
  }
  if (Array.isArray(value)) return value.map((item) => automationStudioCappedProse(item, maxLength, key)) as Value;
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([entryKey, item]) => [entryKey, automationStudioCappedProse(item as JsonValue, maxLength, entryKey)])) as Value;
  }
  return value;
}

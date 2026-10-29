/**
 * JSON with object keys sorted at every depth, so two inputs that differ only
 * in key order serialise the same. `undefined` members are left out, as
 * `JSON.stringify` leaves them out.
 */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(sortKeys(value));
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value === null || typeof value !== "object") return value;
  const sorted: Record<string, unknown> = {};
  for (const key of Object.keys(value).sort()) sorted[key] = sortKeys((value as Record<string, unknown>)[key]);
  return sorted;
}

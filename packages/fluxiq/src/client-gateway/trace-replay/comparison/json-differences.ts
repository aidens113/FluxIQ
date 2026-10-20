// The paths at which two JSON values differ (traces and offline trials, P3).
// Arrays compare item by item; objects key by key, and, when `ordered`, also by
// key order (source plan 3.3 keeps key order), reported as `<path> (key
// order)`. A path is dotted, with array items as `[n]`; the root is its own
// prefix.

export function clientGatewayTraceJsonDifferences(left: unknown, right: unknown, path: string, ordered: boolean): string[] {
  if (Array.isArray(left) && Array.isArray(right)) return arrayDifferences(left, right, path, ordered);
  if (isRecord(left) && isRecord(right)) return recordDifferences(left, right, path, ordered);
  return Object.is(left, right) ? [] : [path];
}

function arrayDifferences(left: readonly unknown[], right: readonly unknown[], path: string, ordered: boolean): string[] {
  if (left.length !== right.length) return [path];
  const differences: string[] = [];
  for (let index = 0; index < left.length; index += 1) differences.push(...clientGatewayTraceJsonDifferences(left[index], right[index], `${path}[${index}]`, ordered));
  return differences;
}

function recordDifferences(left: Record<string, unknown>, right: Record<string, unknown>, path: string, ordered: boolean): string[] {
  const differences: string[] = [];
  const leftKeys = Object.keys(left);
  const rightKeys = Object.keys(right);
  for (const key of new Set([...leftKeys, ...rightKeys])) {
    const child = path === "" ? key : `${path}.${key}`;
    if (!Object.hasOwn(left, key) || !Object.hasOwn(right, key)) differences.push(child);
    else differences.push(...clientGatewayTraceJsonDifferences(left[key], right[key], child, ordered));
  }
  if (ordered && differences.length === 0 && leftKeys.join("\u0000") !== rightKeys.join("\u0000")) differences.push(`${path} (key order)`);
  return differences;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

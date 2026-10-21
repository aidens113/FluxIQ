// Where two operations differ, by field path and never by value (traces and
// offline trials, P4b): `actionType`, `parameters.query`, `target.ref.0`. An
// evidence gap names these, so a report says what changed without carrying
// what the candidate or the recording sent.

import type { ClientGatewayTraceOperation } from "../types.ts";

export function clientGatewayTraceOperationDifferences(left: ClientGatewayTraceOperation, right: ClientGatewayTraceOperation): string[] {
  const paths: string[] = [];
  collect(left.compared, right.compared, "", paths);
  return paths;
}

function collect(left: unknown, right: unknown, path: string, paths: string[]): void {
  if (isRecord(left) && isRecord(right)) {
    const keys = [...new Set([...Object.keys(left), ...Object.keys(right)])].sort();
    for (const key of keys) collect(left[key], right[key], join(path, key), paths);
    return;
  }
  if (Array.isArray(left) && Array.isArray(right) && left.length === right.length) {
    for (const [index, item] of left.entries()) collect(item, right[index], join(path, String(index)), paths);
    return;
  }
  if (JSON.stringify(left) !== JSON.stringify(right)) paths.push(path === "" ? "operation" : path);
}

function join(path: string, key: string): string {
  return path === "" ? key : `${path}.${key}`;
}

function isRecord(value: unknown): value is { readonly [key: string]: unknown } {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

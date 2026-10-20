// Replaces credential fields in a structured value before it is recorded (D7):
// each field present on `paths` becomes `{ redacted: "credential" }` with a
// declared credential redaction naming it by JSON pointer. The value is copied
// along each path, never mutated, so the live message is untouched.

import type { ClientGatewayTraceRedaction } from "../../trace/index.ts";

type Redacted = { value: unknown; redactions: ClientGatewayTraceRedaction[] };

const REDACTED_CREDENTIAL = Object.freeze({ redacted: "credential" });

export function redactClientGatewayTraceCredentials(value: unknown, paths: readonly (readonly string[])[]): Redacted {
  let current = value;
  const redactions: ClientGatewayTraceRedaction[] = [];
  for (const path of paths) {
    if (!holds(current, path)) continue;
    current = replaced(current, path, 0);
    redactions.push({ path: pointer(path), reason: "credential" });
  }
  return { value: current, redactions };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function holds(value: unknown, path: readonly string[]): boolean {
  let current = value;
  for (const key of path) {
    if (!isRecord(current) || !Object.hasOwn(current, key)) return false;
    current = current[key];
  }
  return current !== undefined;
}

function replaced(value: unknown, path: readonly string[], index: number): unknown {
  if (!isRecord(value)) return value;
  const key = path[index];
  if (key === undefined) return value;
  const copy: Record<string, unknown> = { ...value };
  copy[key] = index === path.length - 1 ? REDACTED_CREDENTIAL : replaced(value[key], path, index + 1);
  return copy;
}

function pointer(path: readonly string[]): string {
  return path.map((key) => `/${key.replaceAll("~", "~0").replaceAll("/", "~1")}`).join("");
}

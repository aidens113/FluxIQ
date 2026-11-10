import { createHash } from "node:crypto";
import { payloadAsSent } from "./as-sent.ts";

/**
 * Top-level fields a call carries beside what it asks for: the session the
 * panel route adds to a session-bound program's payload, and the grant
 * itself. Neither is part of the act a person confirmed, and both differ
 * between the mint and the call it confirms.
 */
const CARRIERS: ReadonlySet<string> = new Set(["authSessionId", "pressGrant"]);

/**
 * The SHA-256 (hex) of a payload's canonical JSON: read as it is sent
 * (`payloadAsSent`, which is also what `call()` hands IAM and the handler of a
 * destructive call; a missing payload reads as `{}`), the carrier fields
 * above dropped from the top level, and every object's keys sorted. Two
 * payloads a handler would read alike digest alike; any other change, however
 * deep, digests differently.
 */
export function pressGrantPayloadDigest(payload: unknown): string {
  const wire: unknown = payload === undefined ? {} : payloadAsSent(payload);
  const asked = isRecord(wire) ? Object.fromEntries(Object.entries(wire).filter(([key]) => !CARRIERS.has(key))) : wire;
  return createHash("sha256").update(canonicalJson(asked)).digest("hex");
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (isRecord(value)) {
    const keys = Object.keys(value).sort();
    return `{${keys.map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

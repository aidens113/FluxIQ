// A command's `lease` field as a client reads it. A lease that is present but
// cannot be read is refused as `host_lease.missing`: Core stamped something,
// and a client that cannot tell whose it is must not act on it. A command with
// no lease at all runs as it always has -- a saved Flow's playback and a
// candidate build issue no leases.

import type { ClientGatewayHostLeaseReading } from "./types.ts";

/** Reads a command's `lease` field, copying only the fields the contract names. */
export function clientGatewayHostLeaseReading(value: unknown): ClientGatewayHostLeaseReading {
  if (value === undefined) return { kind: "none" };
  if (!isRecord(value)) return { kind: "unreadable" };
  const { resourceKey, epoch, holder } = value;
  if (!isText(resourceKey) || !Number.isSafeInteger(epoch) || (epoch as number) < 0 || !isRecord(holder)) return { kind: "unreadable" };
  if (!isText(holder.role) || !isText(holder.briefId)) return { kind: "unreadable" };
  return { kind: "lease", lease: { resourceKey, epoch: epoch as number, holder: { role: holder.role, briefId: holder.briefId } } };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isText(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

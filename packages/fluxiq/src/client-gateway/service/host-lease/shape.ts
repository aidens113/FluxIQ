import type { ClientGatewayHostLease } from "@fluxiq/contracts/client-gateway";

const LEASE_FIELDS = ["resourceKey", "epoch", "holder"];
const HOLDER_FIELDS = ["role", "briefId"];

/** Whether `value` is exactly a host lease: a non-empty resource key, a whole-number epoch, and a holder with a non-empty role and brief id, and nothing else. */
export function isClientGatewayHostLease(value: unknown): value is ClientGatewayHostLease {
  if (!exactObject(value, LEASE_FIELDS)) return false;
  const { resourceKey, epoch, holder } = value as Record<string, unknown>;
  if (typeof resourceKey !== "string" || !resourceKey || !Number.isSafeInteger(epoch)) return false;
  if (!exactObject(holder, HOLDER_FIELDS)) return false;
  const { role, briefId } = holder as Record<string, unknown>;
  return typeof role === "string" && role.length > 0 && typeof briefId === "string" && briefId.length > 0;
}

function exactObject(value: unknown, fields: readonly string[]): boolean {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const keys = Object.keys(value);
  return keys.length === fields.length && keys.every((key) => fields.includes(key));
}

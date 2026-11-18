/** Failure codes for a command refused because of its host lease; category `blocked_by_capability_or_policy`, effect `unacted`. */
export const CLIENT_GATEWAY_HOST_LEASE_REFUSAL_CODES = Object.freeze({
  stale: "host_lease.stale",
  holderMismatch: "host_lease.holder_mismatch",
  missing: "host_lease.missing"
} as const);

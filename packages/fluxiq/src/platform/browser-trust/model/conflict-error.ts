export type ClientTrustConflictReason = "not-loaded" | "stale-generation" | "workspace-rebound" | "trust-rebound" | "removed-trust" | "revoked-trust" | "credential-rebound";

/** Callers must discard a stale gateway/store snapshot; retrying its save must never revive newer trust. */
export class ClientTrustConflictError extends Error {
  readonly code = "browser_trust.conflict";
  readonly reason: ClientTrustConflictReason;

  constructor(reason: ClientTrustConflictReason) {
    super(`Browser trust authority refused a conflicting write (${reason}).`);
    this.name = "ClientTrustConflictError";
    this.reason = reason;
  }
}

/**
 * An immutable event, customer binding, subscription version or checkout was
 * reused; (`version-superseded`) a compare-and-set reconciliation lost to a
 * newer stored version and must re-read before trying again; or
 * (`account-mismatch`) the provider names another account for a subscription
 * than FluxIQ's own records bind it to.
 */
export class CommerceConflictError extends Error {
  constructor(readonly code: "event-reused" | "customer-rebound" | "subscription-rebound" | "version-reused" | "version-superseded" | "checkout-reused" | "account-mismatch") {
    super(`Commerce conflict: ${code}`);
    this.name = "CommerceConflictError";
  }
}

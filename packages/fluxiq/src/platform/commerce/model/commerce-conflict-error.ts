/**
 * An immutable event, customer binding, subscription version or checkout was
 * reused, or (`version-superseded`) a compare-and-set reconciliation lost to a
 * newer stored version and must re-read before trying again.
 */
export class CommerceConflictError extends Error {
  constructor(readonly code: "event-reused" | "customer-rebound" | "subscription-rebound" | "version-reused" | "version-superseded" | "checkout-reused") {
    super(`Commerce conflict: ${code}`);
    this.name = "CommerceConflictError";
  }
}

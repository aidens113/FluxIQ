/**
 * The payment provider did not answer (unreachable, rate limited, or its own
 * server error): the operation may be tried again with the same idempotency
 * key and will then happen once. Never a refusal of the request itself. The
 * message names the operation only, never an id, a key or a provider body.
 */
export class PaymentProviderUnavailableError extends Error {
  constructor(readonly operation: "createCheckout" | "expireCheckout" | "cancelSubscription" | "closeCustomer", options?: { cause?: unknown }) {
    super(`Payment provider unavailable for ${operation}`, options);
    this.name = "PaymentProviderUnavailableError";
  }
}

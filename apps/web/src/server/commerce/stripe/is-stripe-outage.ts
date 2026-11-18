import Stripe from "stripe";

/**
 * Whether a Stripe failure means Stripe did not answer, so the same request
 * with the same idempotency key may be sent again: no connection, a rate
 * limit, or Stripe's own server error. A refused request (bad input, a
 * missing resource, a rejected key) is not an outage.
 */
export function isStripeOutage(error: unknown): boolean {
  if (error instanceof Stripe.errors.StripeConnectionError || error instanceof Stripe.errors.StripeRateLimitError || error instanceof Stripe.errors.StripeAPIError) return true;
  return error instanceof Stripe.errors.StripeError && typeof error.statusCode === "number" && error.statusCode >= 500;
}

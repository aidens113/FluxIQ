import type Stripe from "stripe";
import type { ProviderWebhookEvent } from "fluxiq/platform";

const COMPLETED = new Set(["checkout.session.completed", "checkout.session.async_payment_succeeded"]);

/**
 * The checkout a signed Stripe event reports settled: completed (its session
 * then names the subscription it created) or expired; null for any other
 * event. Which subscription a session created never changes once it
 * completed, so the signed event is trusted for that one fact.
 */
export function stripeEventCheckout(event: Stripe.Event): ProviderWebhookEvent["checkout"] {
  const object = event.data.object as unknown as Record<string, unknown>;
  if (object.object !== "checkout.session" || typeof object.id !== "string" || object.id === "") return null;
  if (COMPLETED.has(event.type)) return { checkoutId: object.id, outcome: "completed" };
  if (event.type === "checkout.session.expired") return { checkoutId: object.id, outcome: "expired" };
  return null;
}

import type Stripe from "stripe";

/**
 * The subscription a Stripe event concerns, or null when it names none. Any
 * event naming one triggers a reconciliation from Stripe's current state, so
 * the event's own payload is never trusted as state and its type needs no list.
 */
export function stripeEventSubscriptionId(event: Stripe.Event): string | null {
  const object = event.data.object as unknown as Record<string, unknown>;
  switch (object.object) {
    case "subscription": return idOf(object.id);
    case "checkout.session": return idOf(object.subscription);
    case "invoice": return idOf(object.subscription) ?? idOf(nested(object.parent, "subscription_details", "subscription"));
    default: return null;
  }
}

function nested(value: unknown, ...path: string[]): unknown {
  let current = value;
  for (const key of path) {
    if (current === null || typeof current !== "object") return undefined;
    current = (current as Record<string, unknown>)[key];
  }
  return current;
}

function idOf(value: unknown): string | null {
  if (typeof value === "string" && value !== "") return value;
  if (value !== null && typeof value === "object" && typeof (value as { id?: unknown }).id === "string") return (value as { id: string }).id;
  return null;
}

import type Stripe from "stripe";
import { expect, it } from "vitest";
import { stripeEventSubscriptionId } from "..";

const eventOf = (object: Record<string, unknown>) => ({ id: "evt_1", type: "x", data: { object } }) as unknown as Stripe.Event;

it("finds the subscription of subscription, checkout and invoice events, and none elsewhere", () => {
  expect(stripeEventSubscriptionId(eventOf({ object: "subscription", id: "sub_1" }))).toBe("sub_1");
  expect(stripeEventSubscriptionId(eventOf({ object: "checkout.session", subscription: "sub_2" }))).toBe("sub_2");
  expect(stripeEventSubscriptionId(eventOf({ object: "checkout.session", subscription: { id: "sub_3" } }))).toBe("sub_3");
  expect(stripeEventSubscriptionId(eventOf({ object: "checkout.session", subscription: null }))).toBeNull();
  expect(stripeEventSubscriptionId(eventOf({ object: "invoice", parent: { subscription_details: { subscription: "sub_4" } } }))).toBe("sub_4");
  expect(stripeEventSubscriptionId(eventOf({ object: "invoice", subscription: "sub_5" }))).toBe("sub_5");
  expect(stripeEventSubscriptionId(eventOf({ object: "customer", id: "cus_1" }))).toBeNull();
});

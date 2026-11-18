import type Stripe from "stripe";
import { describe, expect, it } from "vitest";
import { stripeSubscriptionState } from "..";
import type { CommercePlanCatalog } from "../../types";

const plans: CommercePlanCatalog = {
  shared: { priceId: "price_shared", grants: [{ key: "cloud.shared", allocation: "shared", capabilities: ["execute"], regions: ["region-a"] }] },
  dedicated: { priceId: "price_dedicated", grants: [{ key: "cloud.dedicated", allocation: "dedicated", capabilities: ["execute"], regions: ["region-a"] }] }
};
const sharedItem = { price: { id: "price_shared" }, current_period_start: 1_000, current_period_end: 2_000, metadata: {} };

function subscription(changes: Record<string, unknown> = {}, items: Record<string, unknown>[] = [sharedItem]): Stripe.Subscription {
  return {
    id: "sub_1",
    object: "subscription",
    customer: "cus_1",
    status: "active",
    start_date: 900,
    cancel_at: null,
    cancel_at_period_end: false,
    canceled_at: null,
    ended_at: null,
    metadata: { fluxiq_account_id: "account-a" },
    items: { object: "list", data: items },
    ...changes
  } as unknown as Stripe.Subscription;
}

describe("stripeSubscriptionState", () => {
  it("maps an active subscription paid through its current period, with the plan's grants", () => {
    expect(stripeSubscriptionState(subscription(), plans, 1_500_000)).toEqual({
      accountId: "account-a",
      customerId: "cus_1",
      subscriptionId: "sub_1",
      status: "active",
      paidThroughMs: 2_000_000,
      cancelAtPeriodEnd: false,
      endedAtMs: null,
      verifiedAtMs: 1_500_000,
      entitlements: [{ key: "cloud.shared", allocation: "shared", capabilities: ["execute"], regions: ["region-a"], resourceIds: [], validFromMs: 900_000, validUntilMs: 2_000_000 }]
    });
  });

  it("counts grace from the start of the unpaid period once past due or unpaid", () => {
    expect(stripeSubscriptionState(subscription({ status: "past_due" }), plans, 0)).toMatchObject({ status: "past-due", paidThroughMs: 1_000_000 });
    expect(stripeSubscriptionState(subscription({ status: "unpaid" }), plans, 0)).toMatchObject({ status: "unpaid", paidThroughMs: 1_000_000 });
  });

  it("reports a scheduled cancel at or before the period end, cut to cancel_at", () => {
    expect(stripeSubscriptionState(subscription({ cancel_at_period_end: true }), plans, 0)).toMatchObject({ cancelAtPeriodEnd: true, paidThroughMs: 2_000_000 });
    expect(stripeSubscriptionState(subscription({ cancel_at: 1_800 }), plans, 0)).toMatchObject({ cancelAtPeriodEnd: true, paidThroughMs: 1_800_000 });
    expect(stripeSubscriptionState(subscription({ cancel_at: 5_000 }), plans, 0)).toMatchObject({ cancelAtPeriodEnd: false, paidThroughMs: 2_000_000 });
  });

  it("maps ended, expired, incomplete, paused and trialing subscriptions", () => {
    expect(stripeSubscriptionState(subscription({ status: "canceled", ended_at: 1_700 }), plans, 0)).toMatchObject({ status: "canceled", paidThroughMs: null, endedAtMs: 1_700_000, entitlements: [] });
    expect(stripeSubscriptionState(subscription({ status: "canceled", canceled_at: 1_600 }), plans, 0)).toMatchObject({ endedAtMs: 1_600_000 });
    expect(stripeSubscriptionState(subscription({ status: "incomplete_expired" }), plans, 0)).toMatchObject({ status: "canceled", entitlements: [] });
    expect(stripeSubscriptionState(subscription({ status: "incomplete" }), plans, 0)).toMatchObject({ status: "incomplete", paidThroughMs: null, entitlements: [] });
    expect(stripeSubscriptionState(subscription({ status: "paused" }), plans, 0)).toMatchObject({ status: "paused", paidThroughMs: null });
    expect(stripeSubscriptionState(subscription({ status: "trialing" }), plans, 0)).toMatchObject({ status: "trial", paidThroughMs: 2_000_000 });
  });

  it("binds dedicated grants to the item's exact resources and grants nothing before they are provisioned or for unsold prices", () => {
    const dedicated = { price: { id: "price_dedicated" }, current_period_start: 1_000, current_period_end: 2_000, metadata: { fluxiq_resource_ids: "box-1, box-2,box-1" } };
    expect(stripeSubscriptionState(subscription({}, [dedicated]), plans, 0).entitlements).toEqual([
      { key: "cloud.dedicated", allocation: "dedicated", capabilities: ["execute"], regions: ["region-a"], resourceIds: ["box-1", "box-2"], validFromMs: 900_000, validUntilMs: 2_000_000 }
    ]);
    expect(stripeSubscriptionState(subscription({}, [{ ...dedicated, metadata: {} }]), plans, 0).entitlements).toEqual([]);
    expect(stripeSubscriptionState(subscription({}, [{ ...dedicated, price: { id: "price_support" } }]), plans, 0).entitlements).toEqual([]);
  });

  it("refuses a subscription that names no FluxIQ account", () => {
    expect(() => stripeSubscriptionState(subscription({ metadata: {} }), plans, 0)).toThrow(/names no FluxIQ account/u);
  });
});

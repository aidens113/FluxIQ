import { expect, it } from "vitest";
import type { CommerceBillingPolicy, CommerceCheckoutRecord, CommerceSubscriptionRecord, CommerceSubscriptionSnapshot } from "../../model/index.ts";
import { checkout as recorded, event, grant } from "../../tests/fixtures.ts";
import { deriveCommerceEntitlement } from "../index.ts";

const policy: CommerceBillingPolicy = { allowTrial: false, graceMs: 1_000, retentionMs: 10_000 };
const record = (id: string, changes: Partial<CommerceSubscriptionSnapshot> = {}): CommerceSubscriptionRecord =>
  ({ ...event(id, 1, { subscriptionId: id, ...changes }).subscription, providerId: "fixture-provider" });
const derive = (subscriptions: CommerceSubscriptionRecord[], checkouts: CommerceCheckoutRecord[] = [], nowMs = 2_000) =>
  deriveCommerceEntitlement({ accountId: "account-a", subscriptions, checkouts, nowMs, policy });

it("reports the most permissive state across an account's subscriptions and only admitting grants", () => {
  const dedicated = grant({ key: "cloud.dedicated", allocation: "dedicated", resourceIds: ["box-1"] });
  const entitlement = derive([record("ended", { status: "canceled", endedAtMs: 1_000 }), record("paid", { entitlements: [dedicated] }), record("late", { status: "past-due", paidThroughMs: 1_500 })]);
  expect(entitlement).toMatchObject({ state: "active", grants: [dedicated, grant()] });
  expect(entitlement.graceEndsAt).toBeUndefined();
});

it("reports past-due with the latest grace end when nothing is fully paid", () => {
  expect(derive([record("one", { status: "past-due", paidThroughMs: 1_500 }), record("two", { status: "past-due", paidThroughMs: 1_800 })]))
    .toMatchObject({ state: "past-due", graceEndsAt: 2_800 });
});

it("ranks a scheduled cancel above suspension, a new checkout above an ended subscription", () => {
  expect(derive([record("s", { status: "unpaid" }), record("c", { cancelAtPeriodEnd: true })])).toMatchObject({ state: "cancel-at-period-end", grants: [grant()] });
  const checkout = recorded();
  expect(derive([record("e", { status: "canceled", endedAtMs: 1_000 })], [checkout])).toMatchObject({ state: "checkout-pending", grants: [] });
  expect(derive([record("e", { status: "canceled", endedAtMs: 1_000 })], [checkout], 3_000)).toMatchObject({ state: "ended", retentionEndsAt: 11_000 });
});

it("counts a checkout pending only while it is open: not completed, not expired by FluxIQ, before its expiry", () => {
  const ended = record("e", { status: "canceled", endedAtMs: 1_000 });
  expect(derive([ended], [recorded()])).toMatchObject({ state: "checkout-pending" });
  expect(derive([ended], [recorded({ subscriptionId: "sub-1", completedAtMs: 1_500 })])).toMatchObject({ state: "ended" });
  expect(derive([ended], [recorded({ expiredAtMs: 1_500 })])).toMatchObject({ state: "ended" });
  expect(derive([], [recorded({ expiredAtMs: 1_500 })]).revision).not.toBe(derive([], [recorded()]).revision);
});

it("copies a counted grant's quantity into the entitlement", () => {
  const browsers = grant({ key: "cloud.dedicated", allocation: "dedicated", quantity: 2 });
  expect(derive([record("paid", { entitlements: [browsers] })]).grants).toEqual([browsers]);
});

it("ignores another account's subscriptions and checkouts", () => {
  const foreign = record("foreign", { accountId: "account-b" });
  const checkout = recorded({ accountId: "account-b", checkoutId: "cs-9" });
  expect(derive([foreign], [checkout])).toMatchObject({ accountId: "account-a", state: "none", grants: [] });
});

it("derives a stable revision that changes with the entitlement or its ledger facts, not with re-verification", () => {
  const base = derive([record("paid")]);
  expect(derive([record("paid")]).revision).toBe(base.revision);
  expect(derive([{ ...record("paid"), version: 7, verifiedAtMs: 1_900 }]).revision).toBe(base.revision);
  expect(derive([record("paid", { paidThroughMs: 6_000 })]).revision).not.toBe(base.revision);
  expect(derive([record("paid")], [], 5_000).revision).not.toBe(base.revision);
  expect(base.revision).toMatch(/^[a-f0-9]{32}$/u);
});

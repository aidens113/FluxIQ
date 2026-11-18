// @fluxiq-test-group real-sql
import { afterEach, expect, it } from "vitest";
import { CommerceConflictError } from "../../model/index.ts";
import { grant } from "../../tests/fixtures.ts";
import { removeBillingRoots, setup, state } from "./billing-harness.ts";

afterEach(removeBillingRoots);

const URLS = { successUrl: "https://example.invalid/ok", cancelUrl: "https://example.invalid/no" };

it("records the checkout it starts with its account, plan and customer, and resolves the completed subscription through that record", async () => {
  const billing = await setup({ bound: false });
  const checkout = await billing.service.createCheckout({ accountId: "account-a", planId: "browser", ...URLS });
  expect(await billing.ledger.getCheckout("fake", checkout.checkoutId)).toEqual({
    accountId: "account-a", providerId: "fake", checkoutId: checkout.checkoutId, planId: "browser", customerId: null,
    createdAtMs: 2_000, expiresAtMs: 3_000, subscriptionId: null, completedAtMs: null, expiredAtMs: null
  });
  // The provider echoes no account (stripe-mock's fixture subscriptions carry no metadata): FluxIQ's record decides.
  billing.fake.putSubscription(state({ accountId: null, subscriptionId: "sub-new" }));
  expect(await billing.complete("evt-done", checkout.checkoutId, "sub-new")).toMatchObject({ outcome: "applied", subscriptionId: "sub-new", version: 1 });
  expect(await billing.ledger.getSubscription("fake", "sub-new")).toMatchObject({ accountId: "account-a", customerId: "customer-a" });
  expect(await billing.service.getEntitlement("account-a")).toMatchObject({ state: "active", grants: [grant()] });
  expect((await billing.ledger.getCheckout("fake", checkout.checkoutId))?.completedAtMs).toBe(2_000);
});

it("cannot be redirected by forged metadata: an echo naming another account is refused and nothing is recorded", async () => {
  const billing = await setup({ bound: false });
  const checkout = await billing.service.createCheckout({ accountId: "account-a", planId: "browser", ...URLS });
  billing.fake.putSubscription(state({ accountId: "account-b", subscriptionId: "sub-new" }));
  await expect(billing.complete("evt-forged", checkout.checkoutId, "sub-new")).rejects.toMatchObject({ code: "account-mismatch" });
  expect(await billing.ledger.getSubscription("fake", "sub-new")).toBeNull();
  expect(await billing.service.getEntitlement("account-b")).toMatchObject({ state: "none", grants: [] });
  // The binding stands: the subscription stays account-a's, and a corrected echo applies there.
  billing.fake.putSubscription(state({ subscriptionId: "sub-new" }));
  expect(await billing.deliver("evt-fixed", "sub-new")).toMatchObject({ outcome: "applied", version: 1 });
  expect(await billing.service.getEntitlement("account-a")).toMatchObject({ state: "active" });
});

it("records nothing for a subscription no record binds, even when its metadata names an account", async () => {
  const billing = await setup({ bound: false });
  billing.fake.putSubscription(state({ subscriptionId: "sub-stray" }));
  expect(await billing.deliver("evt-stray", "sub-stray")).toEqual({ eventId: "evt-stray", outcome: "unbound", subscriptionId: "sub-stray", version: null });
  expect(await billing.ledger.getSubscription("fake", "sub-stray")).toBeNull();
  expect(await billing.service.getEntitlement("account-a")).toMatchObject({ state: "none" });
  await expect(billing.service.reconcileSubscription("sub-stray")).rejects.toMatchObject({ code: "subscription-unbound" });
});

it("settles out-of-order and duplicate deliveries: a subscription event before the completion waits for it, and the completion again is a duplicate", async () => {
  const billing = await setup({ bound: false });
  const checkout = await billing.service.createCheckout({ accountId: "account-a", planId: "browser", ...URLS });
  billing.fake.putSubscription(state({ accountId: null, subscriptionId: "sub-new" }));
  expect(await billing.deliver("evt-sub-created", "sub-new")).toMatchObject({ outcome: "unbound" });
  expect(await billing.complete("evt-done", checkout.checkoutId, "sub-new")).toMatchObject({ outcome: "applied", version: 1 });
  expect(await billing.complete("evt-done", checkout.checkoutId, "sub-new")).toMatchObject({ outcome: "duplicate", version: 1 });
  // The early event, redelivered, now applies the current state as the next version.
  expect(await billing.deliver("evt-sub-created", "sub-new")).toMatchObject({ outcome: "applied", version: 2 });
  // A checkout cannot complete again with another subscription.
  billing.fake.putSubscription(state({ accountId: null, subscriptionId: "sub-other" }));
  await expect(billing.complete("evt-again", checkout.checkoutId, "sub-other")).rejects.toBeInstanceOf(CommerceConflictError);
});

it("binds a later subscription of the same customer to the account its first one bound", async () => {
  const billing = await setup({ bound: false });
  const checkout = await billing.service.createCheckout({ accountId: "account-a", planId: "browser", ...URLS });
  billing.fake.putSubscription(state({ accountId: null, subscriptionId: "sub-first" }));
  await billing.complete("evt-first", checkout.checkoutId, "sub-first");
  billing.fake.putSubscription(state({ accountId: null, subscriptionId: "sub-second" }));
  expect(await billing.deliver("evt-second", "sub-second")).toMatchObject({ outcome: "applied" });
  expect(await billing.ledger.getSubscription("fake", "sub-second")).toMatchObject({ accountId: "account-a" });
});

it("expires the account's open checkout when a new one starts, and leaves one the provider already completed", async () => {
  const billing = await setup({ bound: false });
  const first = await billing.service.createCheckout({ accountId: "account-a", planId: "browser", ...URLS });
  const second = await billing.service.createCheckout({ accountId: "account-a", planId: "team", ...URLS });
  expect(billing.fake.checkouts.get(first.checkoutId)?.status).toBe("expired");
  expect((await billing.ledger.getCheckout("fake", first.checkoutId))?.expiredAtMs).toBe(2_000);
  expect(await billing.service.getEntitlement("account-a")).toMatchObject({ state: "checkout-pending" });
  billing.fake.completeCheckout(second.checkoutId);
  const third = await billing.service.createCheckout({ accountId: "account-a", planId: "browser", ...URLS });
  expect((await billing.ledger.getCheckout("fake", second.checkoutId))?.expiredAtMs).toBeNull();
  expect((await billing.service.listCheckouts("account-a")).map((checkout) => checkout.checkoutId).sort()).toEqual([first.checkoutId, second.checkoutId, third.checkoutId].sort());
  // A signed expiry the provider reports is recorded too.
  const { rawBody, signature } = billing.fake.signedEvent({ id: "evt-expired", type: "checkout.session.expired", subscriptionId: null, checkout: { checkoutId: third.checkoutId, outcome: "expired" } });
  expect(await billing.service.ingestWebhook(rawBody, signature)).toMatchObject({ outcome: "ignored" });
  expect((await billing.ledger.getCheckout("fake", third.checkoutId))?.expiredAtMs).toBe(2_000);
});

it("expires the open checkout when the account closes, so nothing can be paid for it", async () => {
  const billing = await setup({ bound: false });
  const checkout = await billing.service.createCheckout({ accountId: "account-a", planId: "browser", ...URLS });
  expect(await billing.service.closeAccount("account-a", "receipt-1")).toEqual({ checkoutsExpired: [checkout.checkoutId], cancelled: [], customersClosed: [] });
  expect(billing.fake.checkouts.get(checkout.checkoutId)?.status).toBe("expired");
  expect(await billing.service.getEntitlement("account-a")).toMatchObject({ state: "none" });
  expect(await billing.service.closeAccount("account-a", "receipt-1")).toEqual({ checkoutsExpired: [], cancelled: [], customersClosed: [] });
});

it("keeps a grant's quantity through the ledger into the entitlement", async () => {
  const billing = await setup();
  const browsers = grant({ key: "cloud.dedicated", allocation: "dedicated", capabilities: ["environment.dedicated"], quantity: 3 });
  billing.fake.putSubscription(state({ entitlements: [browsers] }));
  await billing.deliver("evt-browsers");
  expect((await billing.service.getEntitlement("account-a")).grants).toEqual([browsers]);
});

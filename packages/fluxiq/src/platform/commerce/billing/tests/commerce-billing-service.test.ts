// @fluxiq-test-group real-sql
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, expect, it } from "vitest";
import { SQLiteCommerceLedger } from "../../storage/index.ts";
import { grant } from "../../tests/fixtures.ts";
import { CommerceBillingService, FakePaymentProvider, PaymentProviderUnavailableError } from "../index.ts";
import type { PaymentProvider, ProviderSubscriptionState } from "../index.ts";

const SECRET = "whsec_fake_local_test_secret";
const roots: string[] = [];
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

function state(changes: Partial<ProviderSubscriptionState> = {}): ProviderSubscriptionState {
  return {
    accountId: "account-a",
    customerId: "customer-a",
    subscriptionId: "sub-a",
    status: "active",
    paidThroughMs: 5_000,
    cancelAtPeriodEnd: false,
    endedAtMs: null,
    verifiedAtMs: 0,
    entitlements: [grant()],
    ...changes
  };
}

async function setup(options: { provider?: (fake: FakePaymentProvider) => PaymentProvider } = {}) {
  const rootDir = await mkdtemp(path.join(os.tmpdir(), "fluxiq-billing-"));
  roots.push(rootDir);
  const clock = { nowMs: 2_000 };
  const fake = new FakePaymentProvider({ webhookSecret: SECRET, now: () => clock.nowMs, checkoutLifetimeMs: 1_000 });
  const provider = options.provider?.(fake) ?? fake;
  const open = () => new CommerceBillingService({
    ledger: new SQLiteCommerceLedger({ rootDir, now: () => clock.nowMs }),
    provider,
    policy: { allowTrial: false, graceMs: 1_000, retentionMs: 30_000 },
    refreshAfterMs: 500,
    now: () => clock.nowMs
  });
  let service = open();
  const deliver = (id: string, subscriptionId: string | null = "sub-a") => {
    const { rawBody, signature } = fake.signedEvent({ id, type: "customer.subscription.updated", subscriptionId });
    return service.ingestWebhook(rawBody, signature);
  };
  return {
    rootDir,
    clock,
    fake,
    deliver,
    get service() {
      return service;
    },
    restart() {
      service = open();
      return service;
    }
  };
}

it("walks every transition: none, checkout-pending, active, past-due, suspended, active, cancel-at-period-end, ended", async () => {
  const billing = await setup();
  const { fake, clock } = billing;
  const entitlement = () => billing.service.getEntitlement("account-a");
  expect(await entitlement()).toMatchObject({ state: "none", grants: [] });

  const checkout = await billing.service.createCheckout({ accountId: "account-a", planId: "shared", successUrl: "https://example.invalid/ok", cancelUrl: "https://example.invalid/no" });
  expect(checkout).toMatchObject({ checkoutId: "fake_cs_1", expiresAtMs: 3_000 });
  const pending = await entitlement();
  expect(pending).toMatchObject({ state: "checkout-pending", grants: [] });

  fake.putSubscription(state());
  expect(await billing.deliver("evt-paid")).toMatchObject({ outcome: "applied", version: 1 });
  const active = await entitlement();
  expect(active).toMatchObject({ state: "active", grants: [grant()] });
  expect(active.revision).not.toBe(pending.revision);

  fake.putSubscription(state({ status: "past-due", paidThroughMs: 2_000, entitlements: [grant({ validUntilMs: 2_000 })] }));
  clock.nowMs = 2_100;
  expect(await billing.deliver("evt-failed")).toMatchObject({ outcome: "applied", version: 2 });
  expect(await entitlement()).toMatchObject({ state: "past-due", graceEndsAt: 3_000, grants: [grant({ validUntilMs: 2_000 })] });

  clock.nowMs = 3_000;
  expect(await entitlement()).toMatchObject({ state: "suspended", grants: [] });
  expect((await entitlement()).graceEndsAt).toBeUndefined();

  fake.putSubscription(state({ paidThroughMs: 9_000, entitlements: [grant({ validUntilMs: 9_000 })] }));
  await billing.deliver("evt-recovered");
  expect(await entitlement()).toMatchObject({ state: "active" });

  fake.putSubscription(state({ paidThroughMs: 9_000, cancelAtPeriodEnd: true, entitlements: [grant({ validUntilMs: 9_000 })] }));
  await billing.deliver("evt-cancel-scheduled");
  expect(await entitlement()).toMatchObject({ state: "cancel-at-period-end", grants: [grant({ validUntilMs: 9_000 })] });

  clock.nowMs = 9_500;
  fake.putSubscription(state({ status: "canceled", paidThroughMs: null, cancelAtPeriodEnd: false, endedAtMs: 9_000, entitlements: [] }));
  await billing.deliver("evt-ended");
  const ended = await entitlement();
  expect(ended).toMatchObject({ state: "ended", retentionEndsAt: 39_000, grants: [] });
  clock.nowMs = 40_000;
  expect(await entitlement()).toMatchObject({ state: "ended", retentionEndsAt: 39_000 });
});

it("restricts a paused subscription and a trial the policy does not admit", async () => {
  const billing = await setup();
  billing.fake.putSubscription(state({ status: "paused", paidThroughMs: null, entitlements: [] }));
  await billing.deliver("evt-paused");
  expect(await billing.service.getEntitlement("account-a")).toMatchObject({ state: "restricted", grants: [] });
  billing.fake.putSubscription(state({ status: "trial" }));
  await billing.deliver("evt-trial");
  expect(await billing.service.getEntitlement("account-a")).toMatchObject({ state: "restricted", grants: [] });
});

it("lets checkout-pending lapse when the checkout expires without a subscription", async () => {
  const billing = await setup();
  await billing.service.createCheckout({ accountId: "account-a", planId: "shared", successUrl: "https://example.invalid/ok", cancelUrl: "https://example.invalid/no" });
  billing.clock.nowMs = 3_000;
  expect(await billing.service.getEntitlement("account-a")).toMatchObject({ state: "none" });
});

it("answers a duplicate delivery from the ledger without fetching the provider again", async () => {
  const billing = await setup();
  billing.fake.putSubscription(state());
  const { rawBody, signature } = billing.fake.signedEvent({ id: "evt-1", type: "customer.subscription.created", subscriptionId: "sub-a" });
  expect(await billing.service.ingestWebhook(rawBody, signature)).toMatchObject({ outcome: "applied", version: 1 });
  expect(await billing.service.ingestWebhook(rawBody, signature)).toEqual({ eventId: "evt-1", outcome: "duplicate", subscriptionId: "sub-a", version: 1 });
  expect(billing.fake.fetches.get("sub-a")).toBe(1);
});

it("tolerates out-of-order delivery: a late older event cannot restore an older state", async () => {
  const billing = await setup();
  billing.fake.putSubscription(state({ status: "canceled", paidThroughMs: null, endedAtMs: 1_900, entitlements: [] }));
  // The cancellation is delivered first; the older activation event arrives after it.
  await billing.deliver("evt-2-canceled");
  expect(await billing.deliver("evt-1-activated")).toMatchObject({ outcome: "applied", version: 2 });
  expect(await billing.service.getEntitlement("account-a")).toMatchObject({ state: "ended" });
});

it("refuses a bad signature, a changed body and a stale timestamp without touching the ledger", async () => {
  const billing = await setup();
  billing.fake.putSubscription(state());
  const { rawBody, signature } = billing.fake.signedEvent({ id: "evt-1", type: "customer.subscription.created", subscriptionId: "sub-a" });
  await expect(billing.service.ingestWebhook(rawBody, null)).rejects.toMatchObject({ name: "PaymentWebhookVerificationError", reason: "missing-signature" });
  await expect(billing.service.ingestWebhook(rawBody.replace("sub-a", "sub-b"), signature)).rejects.toMatchObject({ reason: "bad-signature" });
  const forged = new FakePaymentProvider({ webhookSecret: "whsec_someone_elses_secret" }).signedEvent({ id: "evt-1", type: "x", subscriptionId: "sub-a" }, 2_000);
  await expect(billing.service.ingestWebhook(forged.rawBody, forged.signature)).rejects.toMatchObject({ reason: "bad-signature" });
  billing.clock.nowMs = 2_000 + 301_000;
  await expect(billing.service.ingestWebhook(rawBody, signature)).rejects.toMatchObject({ reason: "timestamp-outside-tolerance" });
  expect(billing.fake.fetches.size).toBe(0);
  expect(await billing.service.getEntitlement("account-a")).toMatchObject({ state: "none" });
});

it("replays deliveries after a restart as duplicates and keeps the entitlement", async () => {
  const billing = await setup();
  billing.fake.putSubscription(state());
  const first = billing.fake.signedEvent({ id: "evt-1", type: "customer.subscription.created", subscriptionId: "sub-a" });
  await billing.service.ingestWebhook(first.rawBody, first.signature);
  const before = await billing.service.getEntitlement("account-a");
  const restarted = billing.restart();
  expect(await restarted.ingestWebhook(first.rawBody, first.signature)).toMatchObject({ outcome: "duplicate", version: 1 });
  expect(await restarted.getEntitlement("account-a")).toEqual(before);
  expect(billing.fake.fetches.get("sub-a")).toBe(1);
});

it("settles concurrent deliveries of one event as one write and a duplicate", async () => {
  const billing = await setup();
  billing.fake.putSubscription(state());
  const { rawBody, signature } = billing.fake.signedEvent({ id: "evt-1", type: "customer.subscription.created", subscriptionId: "sub-a" });
  const results = await Promise.all([billing.service.ingestWebhook(rawBody, signature), billing.service.ingestWebhook(rawBody, signature)]);
  expect(results.map((result) => result.outcome).sort()).toEqual(["applied", "duplicate"]);
  expect(results.every((result) => result.version === 1)).toBe(true);
});

it("serializes racing reconciliations so the last committed write is the newest provider state", async () => {
  let release: () => void = () => undefined;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  let stalled: () => void = () => undefined;
  const firstFetchStalled = new Promise<void>((resolve) => { stalled = resolve; });
  let calls = 0;
  const billing = await setup({
    provider: (fake) => ({
      providerId: fake.providerId,
      createCheckout: (request) => fake.createCheckout(request),
      createPortal: (request) => fake.createPortal(request),
      verifyWebhook: (body, header) => fake.verifyWebhook(body, header),
      cancelSubscription: (id, options) => fake.cancelSubscription(id, options),
      closeCustomer: (id, options) => fake.closeCustomer(id, options),
      // The first fetch reads the old state, then stalls until a newer write committed.
      getSubscription: async (id) => {
        calls += 1;
        const fetched = await fake.getSubscription(id);
        if (calls === 1) {
          stalled();
          await gate;
        }
        return fetched;
      }
    })
  });
  billing.fake.putSubscription(state());
  const slow = billing.deliver("evt-old");
  await firstFetchStalled;
  billing.fake.putSubscription(state({ status: "canceled", paidThroughMs: null, endedAtMs: 1_950, entitlements: [] }));
  expect(await billing.deliver("evt-new")).toMatchObject({ outcome: "applied", version: 1 });
  release();
  // The stale fetch lost its compare-and-set, fetched again and wrote the current (canceled) state.
  expect(await slow).toMatchObject({ outcome: "applied", version: 2 });
  expect(calls).toBe(3);
  expect(await billing.service.getEntitlement("account-a")).toMatchObject({ state: "ended" });
});

it("ignores events that name no subscription and refuses a subscription the provider does not have", async () => {
  const billing = await setup();
  expect(await billing.deliver("evt-customer", null)).toEqual({ eventId: "evt-customer", outcome: "ignored", subscriptionId: null, version: null });
  await expect(billing.deliver("evt-ghost", "sub-ghost")).rejects.toMatchObject({ code: "subscription-missing-at-provider" });
  billing.fake.putSubscription(state({ subscriptionId: "sub-ghost" }));
  expect(await billing.deliver("evt-ghost", "sub-ghost")).toMatchObject({ outcome: "applied" });
});

it("reconciles subscriptions whose verification is due, and only those", async () => {
  const billing = await setup();
  billing.fake.putSubscription(state());
  await billing.deliver("evt-1");
  expect(await billing.service.reconcileDue()).toEqual({ reconciled: [], failed: [] });
  billing.clock.nowMs = 2_500;
  billing.fake.putSubscription(state({ status: "past-due", paidThroughMs: 2_400 }));
  expect(await billing.service.reconcileDue()).toEqual({ reconciled: ["sub-a"], failed: [] });
  expect(await billing.service.getEntitlement("account-a")).toMatchObject({ state: "past-due", graceEndsAt: 3_400 });
  expect(await billing.service.reconcileSubscription("sub-a")).toMatchObject({ outcome: "applied", version: 3 });
});

it("keeps the revision when a reconciliation only re-confirms the same provider state", async () => {
  const billing = await setup();
  billing.fake.putSubscription(state());
  await billing.deliver("evt-1");
  const before = await billing.service.getEntitlement("account-a");
  billing.clock.nowMs = 2_600;
  await billing.service.reconcileSubscription("sub-a");
  expect((await billing.service.getEntitlement("account-a")).revision).toBe(before.revision);
});

it("opens the portal for the account's own customer from the ledger, never a caller-named one", async () => {
  const billing = await setup();
  await expect(billing.service.createPortal({ accountId: "account-a", returnUrl: "https://example.invalid/back" })).rejects.toMatchObject({ code: "no-customer" });
  billing.fake.putSubscription(state());
  await billing.deliver("evt-1");
  expect(await billing.service.createPortal({ accountId: "account-a", returnUrl: "https://example.invalid/back" })).toEqual({ url: "https://portal.fake.invalid/customer-a" });
  await expect(billing.service.createPortal({ accountId: "account-b", returnUrl: "https://example.invalid/back" })).rejects.toMatchObject({ code: "no-customer" });
});

it("keeps each account's entitlement to its own subscriptions", async () => {
  const billing = await setup();
  billing.fake.putSubscription(state());
  await billing.deliver("evt-1");
  expect(await billing.service.getEntitlement("account-b")).toMatchObject({ accountId: "account-b", state: "none", grants: [] });
});

it("closes an account's billing once: cancels what has not ended, records it ended, closes the customer, and leaves other accounts alone", async () => {
  const billing = await setup();
  billing.fake.putSubscription(state());
  billing.fake.putSubscription(state({ subscriptionId: "sub-old", status: "canceled", paidThroughMs: null, endedAtMs: 1_000, entitlements: [] }));
  billing.fake.putSubscription(state({ accountId: "account-b", customerId: "customer-b", subscriptionId: "sub-b" }));
  await billing.deliver("evt-a");
  await billing.deliver("evt-old", "sub-old");
  await billing.deliver("evt-b", "sub-b");
  expect(await billing.service.closeAccount("account-a", "receipt-1")).toEqual({ cancelled: ["sub-a"], customersClosed: ["customer-a"] });
  expect([...billing.fake.cancellations]).toEqual([["receipt-1:cancel:sub-a", "sub-a"]]);
  expect([...billing.fake.customerClosures]).toEqual([["receipt-1:close:customer-a", "customer-a"]]);
  expect(await billing.service.getEntitlement("account-a")).toMatchObject({ state: "ended", grants: [], retentionEndsAt: billing.clock.nowMs + 30_000 });
  expect(await billing.service.getEntitlement("account-b")).toMatchObject({ state: "active" });
  // Asked again (a retried deletion), nothing is cancelled twice.
  expect(await billing.service.closeAccount("account-a", "receipt-1")).toEqual({ cancelled: [], customersClosed: ["customer-a"] });
  expect(billing.fake.cancellations.size).toBe(1);
  expect(billing.fake.customerClosures.size).toBe(1);
});

it("throws a provider outage as it came, and the retry with the same operation cancels once", async () => {
  const billing = await setup();
  billing.fake.putSubscription(state());
  await billing.deliver("evt-a");
  billing.fake.unavailable = true;
  await expect(billing.service.closeAccount("account-a", "receipt-1")).rejects.toBeInstanceOf(PaymentProviderUnavailableError);
  expect(await billing.service.getEntitlement("account-a")).toMatchObject({ state: "active" });
  billing.fake.unavailable = false;
  expect(await billing.service.closeAccount("account-a", "receipt-1")).toEqual({ cancelled: ["sub-a"], customersClosed: ["customer-a"] });
  expect(billing.fake.cancellations.size).toBe(1);
  await expect(billing.service.closeAccount("", "receipt-1")).rejects.toMatchObject({ code: "invalid-request" });
});

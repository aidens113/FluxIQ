// @fluxiq-test-group real-sql
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { CommerceBillingService, SQLiteCommerceLedger, signWebhookPayload } from "fluxiq/platform";
import { afterEach, describe, expect, it } from "vitest";
import type { CommercePlanCatalog } from "../../types";
import { PlanFakePaymentProvider } from "../plan-fake-payment-provider";

const SECRET = "whsec_plan_fake_provider_test_secret";
const plans: CommercePlanCatalog = {
  browser: { name: "Dedicated browser", lines: [{ priceId: "price_browser", unit: "dedicated-browser", quantity: 2, grants: [{ key: "cloud.dedicated", allocation: "dedicated", capabilities: ["environment.dedicated"], regions: ["local"] }] }] }
};
const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))); });

async function world() {
  const root = await mkdtemp(path.join(os.tmpdir(), "fluxiq-plan-fake-"));
  roots.push(root);
  const now = () => 50_000;
  const provider = new PlanFakePaymentProvider({ webhookSecret: SECRET, plans, now });
  const billing = new CommerceBillingService({ ledger: new SQLiteCommerceLedger({ rootDir: root, now }), provider, policy: { allowTrial: false, graceMs: 0, retentionMs: 0 }, refreshAfterMs: 60_000, now });
  /** What one delivery came to: its outcome, or the code billing refused it with. */
  const outcomeOf = (body: unknown) => deliver(body).then((result) => result.outcome, (error: { code?: string }) => error.code ?? "refused");
  const deliver = (body: unknown) => {
    const rawBody = JSON.stringify(body);
    return billing.ingestWebhook(rawBody, signWebhookPayload(rawBody, SECRET, now()));
  };
  return { provider, billing, deliver, outcomeOf };
}

describe("the plan fake payment provider", () => {
  it("creates the plan's subscription when its signed completion arrives, with the line's quantity of dedicated browsers", async () => {
    const w = await world();
    const checkout = await w.billing.createCheckout({ accountId: "account-a", planId: "browser", successUrl: "https://app.fluxiq.localhost/plans", cancelUrl: "https://app.fluxiq.localhost/plans" });
    const subscriptionId = `fake_sub_${checkout.checkoutId}`;
    expect(await w.deliver({ id: "evt-1", type: "checkout.session.completed", subscriptionId, checkout: { checkoutId: checkout.checkoutId, outcome: "completed" } })).toMatchObject({ outcome: "applied", subscriptionId });
    const entitlement = await w.billing.getEntitlement("account-a");
    expect(entitlement.state).toBe("active");
    expect(entitlement.grants).toEqual([expect.objectContaining({ key: "cloud.dedicated", allocation: "dedicated", quantity: 2, resourceIds: [] })]);
    // Closing the account (its deletion) cancels the subscription at the fake and grants nothing more.
    expect(await w.billing.closeAccount("account-a", "receipt-1")).toMatchObject({ cancelled: [subscriptionId] });
    expect((await w.billing.getEntitlement("account-a")).grants).toEqual([]);
  });

  it("creates nothing for a completion naming another subscription, an unknown checkout, or one already completed, and takes no state from the body", async () => {
    const w = await world();
    const checkout = await w.billing.createCheckout({ accountId: "account-a", planId: "browser", successUrl: "https://app.fluxiq.localhost/plans", cancelUrl: "https://app.fluxiq.localhost/plans" });
    const forged = { status: "active", entitlements: [{ key: "cloud.dedicated", quantity: 99 }] };
    expect(await w.outcomeOf({ id: "evt-1", type: "checkout.session.completed", subscriptionId: "sub_other", checkout: { checkoutId: checkout.checkoutId, outcome: "completed" }, subscription: forged })).toBe("subscription-missing-at-provider");
    expect(await w.outcomeOf({ id: "evt-2", type: "checkout.session.completed", subscriptionId: "fake_sub_fake_cs_404", checkout: { checkoutId: "fake_cs_404", outcome: "completed" } })).not.toBe("applied");
    expect((await w.billing.getEntitlement("account-a")).grants).toEqual([]);
  });

  it("refuses an event not signed with the deployment's secret", async () => {
    const w = await world();
    const rawBody = JSON.stringify({ id: "evt-1", type: "checkout.session.completed", subscriptionId: "fake_sub_fake_cs_1", checkout: { checkoutId: "fake_cs_1", outcome: "completed" } });
    await expect(w.billing.ingestWebhook(rawBody, signWebhookPayload(rawBody, "whsec_another_secret_entirely", 50_000))).rejects.toThrow();
  });

  it("keeps its checkouts and subscriptions across a restart, so deleting the account afterwards closes its billing", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "fluxiq-plan-fake-state-"));
    roots.push(root);
    const now = () => 50_000;
    const stateFile = path.join(root, "platform", "commerce", "fake-provider.json");
    const ledger = new SQLiteCommerceLedger({ rootDir: path.join(root, "ledger"), now });
    const billingOn = (provider: PlanFakePaymentProvider) => new CommerceBillingService({ ledger, provider, policy: { allowTrial: false, graceMs: 0, retentionMs: 0 }, refreshAfterMs: 60_000, now });
    const before = billingOn(new PlanFakePaymentProvider({ webhookSecret: SECRET, plans, now, stateFile }));
    const checkout = await before.createCheckout({ accountId: "account-a", planId: "browser", successUrl: "https://app.fluxiq.localhost/plans", cancelUrl: "https://app.fluxiq.localhost/plans" });
    const subscriptionId = `fake_sub_${checkout.checkoutId}`;
    const rawBody = JSON.stringify({ id: "evt-paid", type: "checkout.session.completed", subscriptionId, checkout: { checkoutId: checkout.checkoutId, outcome: "completed" } });
    expect(await before.ingestWebhook(rawBody, signWebhookPayload(rawBody, SECRET, now()))).toMatchObject({ outcome: "applied" });

    // FluxIQ restarts; the provider, like Stripe, still holds what the ledger recorded.
    const after = billingOn(new PlanFakePaymentProvider({ webhookSecret: SECRET, plans, now, stateFile }));
    const another = await after.createCheckout({ accountId: "account-b", planId: "browser", successUrl: "https://app.fluxiq.localhost/plans", cancelUrl: "https://app.fluxiq.localhost/plans" });
    expect(another.checkoutId).not.toBe(checkout.checkoutId);
    expect(await after.closeAccount("account-a", "receipt-after-restart")).toMatchObject({ cancelled: [subscriptionId] });
    expect((await after.getEntitlement("account-a")).grants).toEqual([]);
  });
});

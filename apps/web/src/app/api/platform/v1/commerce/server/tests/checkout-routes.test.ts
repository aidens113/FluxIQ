// @fluxiq-test-group real-sql
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { CommerceBillingService, FakePaymentProvider, PaymentProviderUnavailableError, SQLiteCommerceLedger } from "fluxiq/platform";
import type { PlatformWorkspaceRecord } from "fluxiq/platform";
import { afterEach, describe, expect, it } from "vitest";
import type { CommercePlanCatalog } from "../../../../../../../server/commerce";
import { billingStatus } from "../billing-status";
import { startCheckout } from "../start-checkout";
import type { CommerceRouteDeps } from "../types";

// The checkout routes' work over the real billing service and ledger with the
// fake payment provider. The route wrapper's IAM decision is the shared
// workspace route context's, tested with it; here the caller's workspace is given.

const SECRET = "whsec_checkout_route_test_secret";
const roots: string[] = [];
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

const dedicated = { key: "cloud.dedicated", allocation: "dedicated" as const, capabilities: ["environment.dedicated"], regions: ["local"] };
const plans: CommercePlanCatalog = {
  browser: { name: "One browser", lines: [{ priceId: "price_browser", unit: "dedicated-browser", quantity: 1, grants: [dedicated] }] },
  team: { name: "Team", lines: [{ priceId: "price_team_browser", unit: "dedicated-browser", quantity: 2, grants: [dedicated] }, { priceId: "price_seat", unit: "seat", quantity: 5, grants: [{ key: "cloud.shared", allocation: "shared", capabilities: ["execute"], regions: ["local"] }] }] }
};

async function setup() {
  const root = await mkdtemp(path.join(os.tmpdir(), "fluxiq-checkout-route-"));
  roots.push(root);
  const clock = { nowMs: 10_000 };
  const provider = new FakePaymentProvider({ webhookSecret: SECRET, now: () => clock.nowMs, checkoutLifetimeMs: 3_600_000 });
  const billing = new CommerceBillingService({ ledger: new SQLiteCommerceLedger({ rootDir: root, now: () => clock.nowMs }), provider, policy: { allowTrial: false, graceMs: 0, retentionMs: 0 }, refreshAfterMs: 60_000, now: () => clock.nowMs });
  const workspaces = new Map<string, PlatformWorkspaceRecord>([
    ["ws-a", { workspaceId: "ws-a", kind: "personal", ownerUserId: "account-a", createdAtMs: 0 }],
    ["org", { workspaceId: "org", kind: "organisation", ownerUserId: null, createdAtMs: 0 }]
  ]);
  const deps = (workspaceId = "ws-a"): CommerceRouteDeps => ({ workspaceId, billing, config: { plans }, workspaces: { getWorkspace: async (id) => workspaces.get(id) ?? null }, publicOrigin: "https://app.example.test/", now: () => clock.nowMs });
  return { provider, billing, deps };
}

describe("the checkout routes", () => {
  it("starts a checkout of a configured plan for the workspace's paying account, returning to /plans", async () => {
    const w = await setup();
    const answer = await startCheckout(w.deps(), JSON.stringify({ planId: "team", accountId: "account-forged" }));
    expect(answer).toEqual({ status: 200, body: { ok: true, checkout: { checkoutId: "fake_cs_1", url: "https://checkout.fake.invalid/fake_cs_1?plan=team", expiresAtMs: 3_610_000 } } });
    expect(w.provider.checkouts.get("fake_cs_1")).toMatchObject({ accountId: "account-a", planId: "team", status: "open" });
    expect(await billingStatus(w.deps())).toEqual({
      status: 200,
      body: {
        ok: true,
        plans: [{ id: "browser", name: "One browser", lines: [{ unit: "dedicated-browser", quantity: 1 }] }, { id: "team", name: "Team", lines: [{ unit: "dedicated-browser", quantity: 2 }, { unit: "seat", quantity: 5 }] }],
        account: { state: "checkout-pending", dedicatedEnvironments: 0, seats: 0, openCheckout: { planId: "team", expiresAtMs: 3_610_000 } }
      }
    });
  });

  it("expires the open checkout when the person starts another", async () => {
    const w = await setup();
    await startCheckout(w.deps(), JSON.stringify({ planId: "team" }));
    await startCheckout(w.deps(), JSON.stringify({ planId: "browser" }));
    expect(w.provider.checkouts.get("fake_cs_1")?.status).toBe("expired");
    expect((await billingStatus(w.deps())).body).toMatchObject({ account: { openCheckout: { planId: "browser" } } });
  });

  it("reports the dedicated browsers and seats a paid plan's grants allow", async () => {
    const w = await setup();
    await startCheckout(w.deps(), JSON.stringify({ planId: "team" }));
    w.provider.completeCheckout("fake_cs_1");
    w.provider.putSubscription({ accountId: null, customerId: "cus-a", subscriptionId: "sub-a", status: "active", paidThroughMs: 50_000, cancelAtPeriodEnd: false, endedAtMs: null, verifiedAtMs: 0, entitlements: [
      { ...dedicated, resourceIds: [], quantity: 2, validFromMs: 0, validUntilMs: 50_000 },
      { key: "cloud.shared", allocation: "shared", capabilities: ["execute"], regions: ["local"], resourceIds: [], quantity: 5, validFromMs: 0, validUntilMs: 50_000 }
    ] });
    const { rawBody, signature } = w.provider.signedEvent({ id: "evt-done", type: "checkout.session.completed", subscriptionId: "sub-a", checkout: { checkoutId: "fake_cs_1", outcome: "completed" } });
    await w.billing.ingestWebhook(rawBody, signature);
    expect((await billingStatus(w.deps())).body).toMatchObject({ account: { state: "active", dedicatedEnvironments: 2, seats: 5, openCheckout: null } });
  });

  it("refuses a plan that is not offered, and a workspace without a paying account", async () => {
    const w = await setup();
    expect(await startCheckout(w.deps(), JSON.stringify({ planId: "constructor" }))).toMatchObject({ status: 400, body: { code: "commerce.unknown_plan" } });
    expect(await startCheckout(w.deps(), "not json")).toMatchObject({ status: 400, body: { code: "commerce.invalid_request" } });
    expect(await startCheckout(w.deps(), "null")).toMatchObject({ status: 400, body: { code: "commerce.unknown_plan" } });
    expect(await startCheckout(w.deps("org"), JSON.stringify({ planId: "team" }))).toMatchObject({ status: 409, body: { code: "commerce.no_billing_account" } });
    expect((await billingStatus(w.deps("org"))).body).toMatchObject({ ok: true, account: null });
    expect(w.provider.checkouts.size).toBe(0);
  });

  it("answers 503 when the payment provider does not answer", async () => {
    const w = await setup();
    const deps = w.deps();
    const outage: CommerceRouteDeps = { ...deps, billing: { ...deps.billing, createCheckout: async () => { throw new PaymentProviderUnavailableError("createCheckout"); } } };
    expect(await startCheckout(outage, JSON.stringify({ planId: "team" }))).toMatchObject({ status: 503, body: { code: "commerce.provider_unavailable" } });
  });
});

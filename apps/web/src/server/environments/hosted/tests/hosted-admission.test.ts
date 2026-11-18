// @fluxiq-test-group real-sql
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  CloudAdmissionService,
  CommerceBillingService,
  DEDICATED_ENVIRONMENT_CAPABILITY,
  EnvironmentController,
  FakeEnvironmentDriver,
  FakePaymentProvider,
  SQLiteCommerceLedger,
  SQLiteEnvironmentStore
} from "fluxiq/platform";
import type { CommerceEntitlementGrant, PlatformWorkspaceRecord, ProviderSubscriptionState } from "fluxiq/platform";
import { afterEach, describe, expect, it } from "vitest";
import { hostedCloudAuthorizer } from "../../authority";
import type { HostedEnvironmentActor } from "../../authority";
import { EnvironmentHoldings, holdingStore } from "../../holdings";

// The hosted admission wiring as the web server composes it, over real
// parts: the commerce ledger and billing with the fake payment provider, cloud
// admission counting against the environment store's holdings, the hosted IAM
// resolver, and the environment controller with the fake driver. A person
// pays through a checkout; the signed completion grants dedicated browsers.
// Synthetic accounts only; nothing leaves the machine.

const SECRET = "whsec_hosted_admission_test_secret";
const roots: string[] = [];
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

const browsers = (quantity: number, validUntilMs: number): CommerceEntitlementGrant => ({
  key: "cloud.dedicated", allocation: "dedicated", capabilities: [DEDICATED_ENVIRONMENT_CAPABILITY], regions: ["local"], resourceIds: [], quantity, validFromMs: 0, validUntilMs
});

async function world() {
  const root = await mkdtemp(path.join(os.tmpdir(), "fluxiq-hosted-admission-"));
  roots.push(root);
  const clock = { nowMs: 10_000 };
  const provider = new FakePaymentProvider({ webhookSecret: SECRET, now: () => clock.nowMs });
  const ledger = new SQLiteCommerceLedger({ rootDir: path.join(root, "commerce"), now: () => clock.nowMs });
  const billing = new CommerceBillingService({ ledger, provider, policy: { allowTrial: false, graceMs: 1_000, retentionMs: 0 }, refreshAfterMs: 5_000, now: () => clock.nowMs });
  const store = new SQLiteEnvironmentStore({ rootDir: path.join(root, "environments"), now: () => clock.nowMs });
  const holdings = new EnvironmentHoldings(store);
  const workspaces = new Map<string, PlatformWorkspaceRecord>([
    ["ws-a", { workspaceId: "ws-a", kind: "personal", ownerUserId: "account-a", createdAtMs: 0 }],
    ["ws-b", { workspaceId: "ws-b", kind: "personal", ownerUserId: "account-b", createdAtMs: 0 }],
    ["org", { workspaceId: "org", kind: "organisation", ownerUserId: null, createdAtMs: 0 }]
  ]);
  const authorize = hostedCloudAuthorizer({ workspaces: { getWorkspace: async (id) => workspaces.get(id) ?? null }, environments: store, region: "local" });
  const admission = new CloudAdmissionService<unknown>({
    deploymentMode: "service",
    authorize,
    ledger,
    holdings,
    policy: { id: "commerce.configuration", maxVerificationAgeMs: 10_000, allowTrial: false, graceMs: 1_000, entitlementKeys: { control: "cloud.control", shared: "cloud.shared", dedicated: "cloud.dedicated" } },
    now: () => clock.nowMs
  });
  const driver = new FakeEnvironmentDriver();
  const controller = new EnvironmentController<unknown>({ store: holdingStore(store, holdings), driver, admission, authorize });
  /** A panel request's held authority, signed in to its workspace as `userId`. */
  const actor = (workspaceId: string, userId: string, valid = { current: true }): HostedEnvironmentActor => ({
    workspaceId,
    revalidate: async () => valid.current
      ? { ok: true, caller: { channel: "panel", actor: { sessionId: "s", userId, roleId: "owner", permissions: [], channel: "panel" }, binding: { channel: "panel", workspaceId, userId, sessionId: "s" } } }
      : { ok: false, status: 401, error: "Authentication required" }
  });
  let operations = 0;
  const run = (kind: "create" | "start" | "stop" | "delete", environmentId: string, who = actor("ws-a", "account-a")) =>
    controller[kind]({ operationId: `op-${(operations += 1)}`, environmentId, workspaceId: who.workspaceId, actor: who });
  /** The account pays: billing records the checkout, the provider completes it, and its signed completion arrives. */
  const subscribe = async (accountId: string, subscription: Partial<ProviderSubscriptionState> = {}) => {
    const checkout = await billing.createCheckout({ accountId, planId: "browsers", successUrl: "https://app.example.test/plans?checkout=success", cancelUrl: "https://app.example.test/plans?checkout=cancel" });
    provider.completeCheckout(checkout.checkoutId);
    provider.putSubscription({ accountId: null, customerId: `cus-${accountId}`, subscriptionId: `sub-${accountId}`, status: "active", paidThroughMs: 100_000, cancelAtPeriodEnd: false, endedAtMs: null, verifiedAtMs: 0, entitlements: [browsers(2, 100_000)], ...subscription });
    const { rawBody, signature } = provider.signedEvent({ id: `evt-${checkout.checkoutId}`, type: "checkout.session.completed", subscriptionId: `sub-${accountId}`, checkout: { checkoutId: checkout.checkoutId, outcome: "completed" } });
    return billing.ingestWebhook(rawBody, signature);
  };
  return { clock, provider, billing, store, driver, controller, actor, run, subscribe };
}

describe("hosted admission wiring", () => {
  it("refuses a dedicated browser without a plan, and admits one once the paid checkout's grant arrives", async () => {
    const w = await world();
    await expect(w.run("create", "env-1")).rejects.toMatchObject({ code: "admission-refused", admission: "subscription-required" });
    expect(await w.subscribe("account-a")).toMatchObject({ outcome: "applied", subscriptionId: "sub-account-a" });
    expect(await w.run("create", "env-1")).toMatchObject({ environmentId: "env-1", accountId: "account-a", workspaceId: "ws-a", desired: "running", observed: "running" });
  });

  it("admits N dedicated browsers for a grant of N, refuses the N+1th, and admits again once one is deleted", async () => {
    const w = await world();
    await w.subscribe("account-a");
    await w.run("create", "env-1");
    await w.run("create", "env-2");
    await expect(w.run("create", "env-3")).rejects.toMatchObject({ code: "admission-refused", admission: "entitlement-exhausted" });
    // Stopping keeps the browser held: a start of it is admitted, another create still is not.
    await w.run("stop", "env-1");
    await expect(w.run("create", "env-3")).rejects.toMatchObject({ admission: "entitlement-exhausted" });
    expect(await w.run("start", "env-1")).toMatchObject({ observed: "running" });
    await w.run("delete", "env-2");
    expect(await w.run("create", "env-3")).toMatchObject({ observed: "running" });
  });

  it("lets only one of two concurrent creates take the last browser", async () => {
    const w = await world();
    await w.subscribe("account-a", { entitlements: [browsers(1, 100_000)] });
    const outcomes = await Promise.allSettled([w.run("create", "env-1"), w.run("create", "env-2")]);
    expect(outcomes.filter((outcome) => outcome.status === "fulfilled")).toHaveLength(1);
    expect((await w.store.listByAccount("account-a")).filter((record) => record.desired !== "deleted")).toHaveLength(1);
  });

  it("refuses new browsers once the plan lapses and never stops a running one", async () => {
    const w = await world();
    await w.subscribe("account-a");
    await w.run("create", "env-1");
    w.clock.nowMs = 20_000;
    w.provider.putSubscription({ accountId: null, customerId: "cus-account-a", subscriptionId: "sub-account-a", status: "past-due", paidThroughMs: 15_000, cancelAtPeriodEnd: false, endedAtMs: null, verifiedAtMs: 0, entitlements: [browsers(2, 15_000)] });
    const { rawBody, signature } = w.provider.signedEvent({ id: "evt-failed", type: "invoice.payment_failed", subscriptionId: "sub-account-a" });
    expect(await w.billing.ingestWebhook(rawBody, signature)).toMatchObject({ outcome: "applied" });
    await expect(w.run("create", "env-2")).rejects.toMatchObject({ code: "admission-refused", admission: "entitlement-required" });
    await w.controller.reconcileAll();
    expect(await w.store.get("env-1")).toMatchObject({ desired: "running", observed: "running" });
    expect(w.driver.calls.filter((call) => call.environmentId === "env-1" && call.step === "stop")).toEqual([]);
    // Stopping and deleting what it holds needs no plan.
    expect(await w.run("stop", "env-1")).toMatchObject({ desired: "stopped" });
  });

  it("keeps each account to its own plan and environments", async () => {
    const w = await world();
    await w.subscribe("account-a");
    await w.run("create", "env-1");
    const intruder = w.actor("ws-b", "account-b");
    await expect(w.run("create", "env-9", intruder)).rejects.toMatchObject({ code: "admission-refused", admission: "subscription-required" });
    await expect(w.run("stop", "env-1", intruder)).rejects.toMatchObject({ code: "not-authorized" });
    await expect(w.run("create", "env-9", w.actor("org", "account-a"))).rejects.toMatchObject({ code: "admission-refused", admission: "not-authorized" });
  });

  it("refuses an actor whose request authority no longer revalidates, or that names another workspace", async () => {
    const w = await world();
    await w.subscribe("account-a");
    const valid = { current: true };
    const held = w.actor("ws-a", "account-a", valid);
    valid.current = false;
    await expect(w.run("create", "env-1", held)).rejects.toMatchObject({ admission: "not-authorized" });
    const elsewhere = { ...w.actor("ws-a", "account-a"), workspaceId: "ws-b" };
    await expect(w.run("create", "env-1", elsewhere)).rejects.toMatchObject({ admission: "not-authorized" });
  });
});

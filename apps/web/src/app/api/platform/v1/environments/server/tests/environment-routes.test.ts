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
import type { PlatformWorkspaceRecord } from "fluxiq/platform";
import { afterEach, describe, expect, it } from "vitest";
import { hostedCloudAuthorizer } from "../../../../../../../server/environments/authority";
import type { HostedEnvironmentActor } from "../../../../../../../server/environments/authority";
import { EnvironmentHoldings, holdingStore } from "../../../../../../../server/environments/holdings";
import { changeEnvironment } from "../change-environment";
import { createEnvironment } from "../create-environment";
import { listEnvironments } from "../list-environments";
import { operationEnvironmentId } from "../operation-environment-id";
import type { EnvironmentRouteDeps } from "../types";

// The environment routes' work over real parts: the commerce ledger and
// billing with the fake payment provider, cloud admission counting the
// account's holdings, the hosted IAM resolver, and the controller with the
// fake driver. The route wrapper's IAM decision is the shared workspace route
// context's, tested with it; here the caller's workspace and held authority
// are given. Synthetic accounts only.

const SECRET = "whsec_environment_routes_test_secret";
const roots: string[] = [];
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function world() {
  const root = await mkdtemp(path.join(os.tmpdir(), "fluxiq-environment-routes-"));
  roots.push(root);
  const clock = { nowMs: 10_000 };
  const provider = new FakePaymentProvider({ webhookSecret: SECRET, now: () => clock.nowMs });
  const ledger = new SQLiteCommerceLedger({ rootDir: path.join(root, "commerce"), now: () => clock.nowMs });
  const billing = new CommerceBillingService({ ledger, provider, policy: { allowTrial: false, graceMs: 0, retentionMs: 0 }, refreshAfterMs: 5_000, now: () => clock.nowMs });
  const store = new SQLiteEnvironmentStore({ rootDir: path.join(root, "environments"), now: () => clock.nowMs });
  const holdings = new EnvironmentHoldings(store);
  const workspaces = new Map<string, PlatformWorkspaceRecord>([
    ["ws-a", { workspaceId: "ws-a", kind: "personal", ownerUserId: "account-a", createdAtMs: 0 }],
    ["ws-b", { workspaceId: "ws-b", kind: "personal", ownerUserId: "account-b", createdAtMs: 0 }]
  ]);
  const authorize = hostedCloudAuthorizer({ workspaces: { getWorkspace: async (id) => workspaces.get(id) ?? null }, environments: store, region: "local" });
  const admission = new CloudAdmissionService<unknown>({
    deploymentMode: "service", authorize, ledger, holdings,
    policy: { id: "commerce.configuration", maxVerificationAgeMs: 10_000, allowTrial: false, graceMs: 0, entitlementKeys: { control: "cloud.control", shared: "cloud.shared", dedicated: "cloud.dedicated" } },
    now: () => clock.nowMs
  });
  const driver = new FakeEnvironmentDriver();
  const controller = new EnvironmentController<HostedEnvironmentActor>({ store: holdingStore(store, holdings), driver, admission, authorize });
  const deps = (workspaceId: string, userId: string): EnvironmentRouteDeps => ({
    workspaceId,
    actor: {
      workspaceId,
      revalidate: async () => ({ ok: true, caller: { channel: "panel", actor: { sessionId: "s", userId, roleId: "owner", permissions: [], channel: "panel" }, binding: { channel: "panel", workspaceId, userId, sessionId: "s" } } })
    } as HostedEnvironmentActor,
    controller,
    environments: store
  });
  /** The account pays for `quantity` dedicated browsers through a completed checkout. */
  const subscribe = async (accountId: string, quantity: number) => {
    const checkout = await billing.createCheckout({ accountId, planId: "browser", successUrl: "https://app.example.test/plans", cancelUrl: "https://app.example.test/plans" });
    provider.completeCheckout(checkout.checkoutId);
    provider.putSubscription({
      accountId: null, customerId: `cus-${accountId}`, subscriptionId: `sub-${accountId}`, status: "active", paidThroughMs: 100_000, cancelAtPeriodEnd: false, endedAtMs: null, verifiedAtMs: 0,
      entitlements: [{ key: "cloud.dedicated", allocation: "dedicated", capabilities: [DEDICATED_ENVIRONMENT_CAPABILITY], regions: ["local"], resourceIds: [], quantity, validFromMs: 0, validUntilMs: 100_000 }]
    });
    const { rawBody, signature } = provider.signedEvent({ id: `evt-${checkout.checkoutId}`, type: "checkout.session.completed", subscriptionId: `sub-${accountId}`, checkout: { checkoutId: checkout.checkoutId, outcome: "completed" } });
    await billing.ingestWebhook(rawBody, signature);
  };
  return { a: deps("ws-a", "account-a"), b: deps("ws-b", "account-b"), subscribe, driver, store };
}

const body = (value: unknown) => JSON.stringify(value);

describe("the environment routes", () => {
  it("refuses a dedicated browser without a plan, then creates one once paid, the same one on a retried operation", async () => {
    const w = await world();
    expect(await createEnvironment(w.a, body({ operationId: "create-1" }))).toEqual({ status: 402, body: expect.objectContaining({ code: "environments.plan_required", reason: "subscription-required" }) });
    await w.subscribe("account-a", 1);
    const created = await createEnvironment(w.a, body({ operationId: "create-1" }));
    const environmentId = operationEnvironmentId("ws-a", "create-1");
    expect(created).toEqual({ status: 200, body: { ok: true, environment: { environmentId, desired: "running", observed: "running" } } });
    expect(await createEnvironment(w.a, body({ operationId: "create-1" }))).toEqual(created);
    expect((await w.store.listByAccount("account-a"))).toHaveLength(1);
  });

  it("admits N browsers for a plan of N and refuses the next", async () => {
    const w = await world();
    await w.subscribe("account-a", 2);
    expect((await createEnvironment(w.a, body({ operationId: "one" }))).status).toBe(200);
    expect((await createEnvironment(w.a, body({ operationId: "two" }))).status).toBe(200);
    expect(await createEnvironment(w.a, body({ operationId: "three" }))).toMatchObject({ status: 402, body: { reason: "entitlement-exhausted" } });
  });

  it("lists, stops, starts and deletes only the caller's own workspace's browsers", async () => {
    const w = await world();
    await w.subscribe("account-a", 1);
    await createEnvironment(w.a, body({ operationId: "mine", environmentId: "env-a" }));
    expect(await listEnvironments(w.a)).toEqual({ status: 200, body: { ok: true, environments: [{ environmentId: "env-a", desired: "running", observed: "running" }] } });
    expect(await listEnvironments(w.b)).toEqual({ status: 200, body: { ok: true, environments: [] } });
    for (const change of ["start", "stop", "delete"] as const) {
      expect(await changeEnvironment(w.b, change, "env-a", body({ operationId: `intrude-${change}` }))).toMatchObject({ status: 404, body: { code: "environments.not_found" } });
    }
    expect(await w.store.get("env-a")).toMatchObject({ desired: "running", observed: "running" });
    expect(await changeEnvironment(w.a, "stop", "env-a", body({ operationId: "stop-1" }))).toMatchObject({ status: 200, body: { environment: { desired: "stopped", observed: "stopped" } } });
    expect(await changeEnvironment(w.a, "start", "env-a", body({ operationId: "start-1" }))).toMatchObject({ status: 200, body: { environment: { desired: "running", observed: "running" } } });
    expect(await changeEnvironment(w.a, "delete", "env-a", body({ operationId: "delete-1" }))).toMatchObject({ status: 200, body: { environment: { desired: "deleted", observed: "deleted" } } });
    expect(w.driver.observation("env-a")).toBe("absent");
    expect(await listEnvironments(w.a)).toEqual({ status: 200, body: { ok: true, environments: [] } });
  });

  it("refuses a malformed request before anything changes", async () => {
    const w = await world();
    await w.subscribe("account-a", 1);
    for (const raw of ["not json", body({}), body({ operationId: "" }), body({ operationId: "has space" }), body({ operationId: "ok", environmentId: 7 })]) {
      expect(await createEnvironment(w.a, raw)).toMatchObject({ status: 400, body: { code: "environments.invalid_request" } });
    }
    expect(await createEnvironment(w.a, body({ operationId: "ok", environmentId: "../escape" }))).toMatchObject({ status: 400 });
    expect(await changeEnvironment(w.a, "stop", "env-a", body({ operationId: "ok", environmentId: "env-b" }))).toMatchObject({ status: 400 });
    expect(await w.store.listAll()).toEqual([]);
  });
});

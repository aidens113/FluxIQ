// @fluxiq-test-group real-sql
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import type { CommerceSubscriptionSnapshot } from "../../model/index.ts";
import { SQLiteCommerceLedger } from "../../storage/index.ts";
import { authority, event, grant, policy } from "../../tests/fixtures.ts";
import { CloudAdmissionService } from "../index.ts";
import type { CloudAdmissionOptions, CommerceAdmissionRequest, CommerceDeploymentMode } from "../index.ts";

const roots: string[] = [];
const request: CommerceAdmissionRequest<string> = { actor: "verified-session", workspaceId: "workspace-a", targetId: "pool-a", capability: "execute" };
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function setup(overrides: Partial<CommerceSubscriptionSnapshot> = {}, populate = true) {
  const rootDir = await mkdtemp(path.join(os.tmpdir(), "fluxiq-cloud-admission-"));
  roots.push(rootDir);
  const ledger = new SQLiteCommerceLedger({ rootDir, now: () => 2_000 });
  if (populate) await ledger.applyVerifiedEvent(event("verified-subscription", 1, overrides));
  const state = { nowMs: 2_000, authority: authority() };
  // The server IAM port is isolated here; it never derives authority from caller routing fields.
  const authorize = vi.fn(async (value: CommerceAdmissionRequest<string>) => value.actor === "verified-session" ? state.authority : null);
  const service = (options: Partial<CloudAdmissionOptions<string>> = {}, omit?: "policy" | "ledger") => {
    const defaults: CloudAdmissionOptions<string> = {
      deploymentMode: "service",
      authorize,
      ledger,
      policy: policy(),
      now: () => state.nowMs
    };
    const configured = { ...defaults, ...options };
    if (omit === "policy") delete configured.policy;
    if (omit === "ledger") delete configured.ledger;
    return new CloudAdmissionService<string>(configured);
  };
  return { ledger, state, authorize, service };
}

it("admits authorized shared cloud execution with the exact subscription/policy revision and exclusive validity", async () => {
  const { service } = await setup();
  expect(await service().admit(request)).toEqual({
    allowed: true,
    source: "commerce",
    principalId: "principal-a",
    accountId: "account-a",
    workspaceId: "workspace-a",
    targetId: "pool-a",
    capability: "execute",
    allocation: "shared",
    policyId: "policy-1",
    entitlementKey: "cloud.shared",
    providerId: "fixture-provider",
    subscriptionId: "subscription-a",
    subscriptionVersion: 1,
    validUntilMs: 2_500
  });
});

it.each<CommerceDeploymentMode>(["local", "self-hosted"])("keeps customer-owned %s execution independent of billing and cloud identity", async (deploymentMode) => {
  const { service, state } = await setup({}, false);
  state.authority.target = {
    kind: "customer-owned",
    targetId: "pool-a",
    ownerAccountId: "account-a",
    ownerWorkspaceId: "workspace-a",
    capabilities: ["execute"]
  };
  state.authority.cloudAuthorization = null;
  const listSubscriptions = vi.fn(async () => { throw new Error("Billing unreachable"); });
  expect(await service({ deploymentMode, ledger: { listSubscriptions } }, "policy").admit(request))
    .toMatchObject({ allowed: true, source: "customer-owned", targetId: "pool-a" });
  expect(listSubscriptions).not.toHaveBeenCalled();
});

it.each<CommerceDeploymentMode>(["local", "self-hosted", "service"])("requires a subscription for every managed-cloud target in %s mode", async (deploymentMode) => {
  const { service } = await setup({}, false);
  expect(await service({ deploymentMode }).admit(request)).toEqual({ allowed: false, reason: "subscription-required" });
});

it("does not trust caller paid/payer/mode metadata or an unverified actor", async () => {
  const { service, state } = await setup();
  const forged = Object.assign({ ...request, actor: "forged-session" }, {
    paid: true,
    accountId: "account-a",
    deploymentMode: "local",
    target: { kind: "customer-owned" }
  });
  expect(await service().admit(forged)).toEqual({ allowed: false, reason: "not-authorized" });
  state.authority.cloudAuthorization = null;
  expect(await service().admit(Object.assign({ ...request }, { cloudAuthorized: true })))
    .toEqual({ allowed: false, reason: "cloud-account-required" });
});

it("keeps workspace authorization, target ownership and cloud account binding independent of subscription", async () => {
  const { service, state } = await setup();
  state.authority.workspaceId = "workspace-b";
  expect(await service().admit(request)).toEqual({ allowed: false, reason: "not-authorized" });
  state.authority = authority();
  state.authority.target.ownerAccountId = "account-b";
  expect(await service().admit(request)).toEqual({ allowed: false, reason: "target-ownership-mismatch" });
  state.authority = authority();
  state.authority.target.ownerWorkspaceId = "workspace-b";
  expect(await service().admit(request)).toEqual({ allowed: false, reason: "target-ownership-mismatch" });
  state.authority = authority({ cloudAuthorization: { accountId: "account-b", workspaceId: "workspace-a" } });
  expect(await service().admit(request)).toEqual({ allowed: false, reason: "cloud-account-required" });
});

it("cannot use another account's paid subscription", async () => {
  const { service } = await setup({ accountId: "account-b", customerId: "customer-b" });
  expect(await service().admit(request)).toEqual({ allowed: false, reason: "subscription-required" });
});

it("denies missing policy or ledger while preserving the explicit cloud target", async () => {
  const { service, authorize } = await setup();
  expect(await service({}, "policy").admit(request)).toEqual({ allowed: false, reason: "commerce-policy-unavailable" });
  expect(await service({}, "ledger").admit(request)).toEqual({ allowed: false, reason: "commerce-policy-unavailable" });
  expect(authorize.mock.calls.map(([value]) => value.targetId)).toEqual(["pool-a", "pool-a"]);
});

it.each<CommerceSubscriptionSnapshot["status"]>(["trial", "past-due", "canceled", "incomplete"])("denies %s without a qualifying explicit policy/grant", async (status) => {
  const { service } = await setup({ status });
  expect(await service().admit(request)).toEqual({ allowed: false, reason: "entitlement-required" });
});

it("permits an explicit trial only within both subscription and grant boundaries", async () => {
  const { service, state } = await setup({ status: "trial" });
  const admission = service({ policy: policy({ allowTrial: true }) });
  expect(await admission.admit(request)).toMatchObject({ allowed: true, source: "commerce" });
  state.nowMs = 5_000;
  expect(await admission.admit(request)).toEqual({ allowed: false, reason: "entitlement-required" });
});

const ineligibleSnapshots: Partial<CommerceSubscriptionSnapshot>[] = [
  { paidThroughMs: null },
  { paidThroughMs: 2_000 },
  { verifiedAtMs: 1_000 },
  { verifiedAtMs: 2_001 },
  { entitlements: [] },
  { entitlements: [grant({ validUntilMs: 2_000 })] },
  { entitlements: [grant({ validFromMs: 2_001 })] },
  { entitlements: [grant({ capabilities: ["inspect"] })] },
  { entitlements: [grant({ regions: ["region-b"] })] },
  { entitlements: [grant({ key: "unrelated" })] }
];

it.each(ineligibleSnapshots)("fails closed for absent, stale, expired or incompatible entitlement %j", async (changes) => {
  const { service } = await setup(changes);
  expect(await service().admit(request)).toEqual({ allowed: false, reason: "entitlement-required" });
});

it("admits at the inclusive grant start and refuses at the exclusive verification boundary", async () => {
  const { service, state } = await setup({ entitlements: [grant({ validFromMs: 2_000 })] });
  const admission = service();
  expect(await admission.admit(request)).toMatchObject({ allowed: true });
  state.nowMs = 2_500;
  expect(await admission.admit(request)).toEqual({ allowed: false, reason: "entitlement-required" });
});

it("requires an installed target capability as well as a purchased entitlement capability", async () => {
  const { service, state } = await setup();
  state.authority.target.capabilities = ["inspect"];
  expect(await service().admit(request)).toEqual({ allowed: false, reason: "capability-unavailable" });
});

it("binds dedicated entitlement to the exact owned resource and region without shared fallback", async () => {
  const { service, state, ledger } = await setup({
    entitlements: [grant({ key: "cloud.dedicated", allocation: "dedicated", resourceIds: ["dedicated-a"] })]
  });
  state.authority.target = {
    kind: "managed-cloud",
    allocation: "dedicated",
    region: "region-a",
    targetId: "dedicated-a",
    ownerAccountId: "account-a",
    ownerWorkspaceId: "workspace-a",
    capabilities: ["execute"]
  };
  const dedicatedRequest = { ...request, targetId: "dedicated-a" };
  expect(await service().admit(dedicatedRequest)).toMatchObject({ allowed: true, allocation: "dedicated", targetId: "dedicated-a" });
  await ledger.applyVerifiedEvent(event("wrong-resource", 2, {
    entitlements: [grant(), grant({ key: "cloud.dedicated", allocation: "dedicated", resourceIds: ["dedicated-b"] })]
  }));
  expect(await service().admit(dedicatedRequest)).toEqual({ allowed: false, reason: "entitlement-required" });
});

it("requires a separate control-service entitlement for customer-owned targets on the hosted engine", async () => {
  const { service, state, ledger } = await setup();
  state.authority.target = {
    kind: "customer-owned",
    targetId: "pool-a",
    ownerAccountId: "account-a",
    ownerWorkspaceId: "workspace-a",
    capabilities: ["execute"]
  };
  expect(await service().admit(request)).toEqual({ allowed: false, reason: "entitlement-required" });
  await ledger.applyVerifiedEvent(event("control-paid", 2, {
    entitlements: [grant({ key: "cloud.control", allocation: "control", regions: [] })]
  }));
  expect(await service().admit(request)).toMatchObject({ allowed: true, allocation: "control", source: "commerce" });
});

it("rechecks the effective subscription on every dispatch decision and cannot reinstate a canceled version", async () => {
  const { service, ledger } = await setup();
  const admission = service();
  expect(await admission.admit(request)).toMatchObject({ allowed: true, subscriptionVersion: 1 });
  await ledger.applyVerifiedEvent(event("cancel", 3, { status: "canceled" }));
  await ledger.applyVerifiedEvent(event("delayed-payment", 2));
  expect(await admission.admit(request)).toEqual({ allowed: false, reason: "entitlement-required" });
});

it("checks expiry after storage finishes rather than before an asynchronous lookup", async () => {
  const { service, ledger, state } = await setup({ paidThroughMs: 2_001 });
  const listSubscriptions = async (accountId: string) => {
    const rows = await ledger.listSubscriptions(accountId);
    state.nowMs = 2_001;
    return rows;
  };
  expect(await service({ ledger: { listSubscriptions } }).admit(request)).toEqual({ allowed: false, reason: "entitlement-required" });
});

it("propagates authorization or ledger outages without allowing execution", async () => {
  const { service } = await setup();
  const authorize = vi.fn(async () => { throw new Error("IAM unavailable"); });
  await expect(service({ authorize }).admit(request)).rejects.toThrow("IAM unavailable");
  const listSubscriptions = vi.fn(async () => { throw new Error("Ledger unavailable"); });
  await expect(service({ ledger: { listSubscriptions } }).admit(request)).rejects.toThrow("Ledger unavailable");
});

it("snapshots request binding before asynchronous authorization", async () => {
  const { service, state } = await setup();
  let release: () => void = () => { throw new Error("Authorization gate not initialized"); };
  const gate = new Promise<void>((resolve) => { release = resolve; });
  const authorize = vi.fn(async (value: CommerceAdmissionRequest<string>) => {
    await gate;
    expect(value.workspaceId).toBe("workspace-a");
    expect(value.targetId).toBe("pool-a");
    return state.authority;
  });
  const mutable = { ...request };
  const checking = service({ authorize }).admit(mutable);
  mutable.workspaceId = "workspace-b";
  mutable.targetId = "other-target";
  release();
  expect(await checking).toMatchObject({ allowed: true, workspaceId: "workspace-a", targetId: "pool-a" });
});

it("rejects malformed policy configuration rather than falling back to permissive defaults", async () => {
  const { service } = await setup();
  expect(() => service({ policy: policy({ maxVerificationAgeMs: 0 }) })).toThrow(TypeError);
  expect(() => service({ policy: policy({ id: "" }) })).toThrow(TypeError);
});

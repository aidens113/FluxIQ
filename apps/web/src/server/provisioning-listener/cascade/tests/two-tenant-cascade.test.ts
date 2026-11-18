// @fluxiq-test-group real-sql
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { IdentityAccessService, type FluxIQ } from "fluxiq";
import { ClientGatewayService } from "fluxiq/client-gateway";
import {
  CommerceBillingService,
  createPlatformServices,
  createSqliteClientTrustRepository,
  FakePaymentProvider,
  MemoryEmailSender,
  MemoryIamAuditSink,
  SQLiteCommerceLedger,
  type ClientTrustRepository,
  type PlatformProvisioningCaller,
  type PlatformServices
} from "fluxiq/platform";
import { afterEach, describe, expect, it } from "vitest";
import { MemoryRecordRepository, WEAK_KDF } from "../../../../app/api/accounts/server/tests/accounts-harness";
import { FluxIQWorkspaceManager } from "../../../../lib/workspaces";
import { composeCascadePorts } from "../compose-cascade-ports";
import { startDeletionSweep } from "../deletion-sweep";

// The deletion cascade and a suspended membership, composed as the web server
// composes them, over real parts: platform services and Identity Access, a
// workspace manager with tenant roots on disk, the browser-trust authority and
// each workspace's real client gateway, and commerce billing over a ledger
// with the fake payment provider. Only the environment controller is a
// recorder here (the web server's environments purge is purge-environments.ts, tested beside it). Synthetic people and
// credentials only; nothing leaves the machine.

const PRIMARY = "workspace-main";
const ORG_B = "org-b";
const SECRET = "whsec_fake_local_test_secret";
const FIXTURE: PlatformProvisioningCaller = { kind: "in-process", actorUserId: null, transport: "in-process" };
const cleanups: Array<() => Promise<void>> = [];

/** The person pays through a checkout: billing records it, the provider completes it, and the signed completion binds the subscription to the person. */
async function subscribe(w: { person: string; billing: CommerceBillingService; provider: FakePaymentProvider }): Promise<void> {
  const checkout = await w.billing.createCheckout({ accountId: w.person, planId: "browser", successUrl: "https://app.example.test/plans?checkout=success", cancelUrl: "https://app.example.test/plans?checkout=cancel" });
  w.provider.completeCheckout(checkout.checkoutId);
  w.provider.putSubscription({ accountId: w.person, customerId: "customer-person", subscriptionId: "sub-person", status: "active", paidThroughMs: 50_000, cancelAtPeriodEnd: false, endedAtMs: null, verifiedAtMs: 0, entitlements: [] });
  const { rawBody, signature } = w.provider.signedEvent({ id: `evt-${checkout.checkoutId}`, type: "checkout.session.completed", subscriptionId: "sub-person", checkout: { checkoutId: checkout.checkoutId, outcome: "completed" } });
  await w.billing.ingestWebhook(rawBody, signature);
}

afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
});

type Tenant = FluxIQ & { gateway: ClientGatewayService };

function gatewayFor(repository: ClientTrustRepository, workspaceId: string): ClientGatewayService {
  const gateway = new ClientGatewayService({
    trustedClientStore: repository.scopedStore(workspaceId),
    trustAuthority: {
      validateApproval: async ({ userId, approvingSessionDigest }) => ({ userId, approvingSessionDigest, maxActiveClients: 10 }),
      grantCredential: async () => undefined
    }
  });
  cleanups.push(() => gateway.close());
  return gateway;
}

async function world() {
  const root = await mkdtemp(path.join(os.tmpdir(), "fluxiq-cascade-"));
  cleanups.push(() => rm(root, { recursive: true, force: true }));
  const trust = createSqliteClientTrustRepository({ filePath: path.join(root, "platform", "browser-trust.sqlite") });
  cleanups.push(() => trust.close());
  const tenantRoot = (workspaceId: string) => path.join(root, "workspaces", workspaceId);
  const gateways = new Map<string, ClientGatewayService>();
  const gateway = (workspaceId: string) => {
    const existing = gateways.get(workspaceId) ?? gatewayFor(trust, workspaceId);
    gateways.set(workspaceId, existing);
    return existing;
  };
  const instance = (workspaceId: string): Tenant => ({ paths: { root: tenantRoot(workspaceId) }, programs: { clientGateway: gateway(workspaceId) }, gateway: gateway(workspaceId), close: async () => undefined } as unknown as Tenant);
  const primary = instance(PRIMARY);
  const busy = new Set<string>();
  const manager = new FluxIQWorkspaceManager({
    tenancy: "multi",
    primaryWorkspaceId: PRIMARY,
    createPrimary: () => primary,
    createTenant: async ({ workspaceId }) => {
      await mkdir(tenantRoot(workspaceId), { recursive: true });
      return instance(workspaceId);
    },
    openExistingTenant: async ({ workspaceId }) => (existsSync(tenantRoot(workspaceId)) ? instance(workspaceId) : null),
    removeTenantRoot: async ({ workspaceId }) => rm(tenantRoot(workspaceId), { recursive: true, force: true }),
    isBusy: (fluxiq) => busy.has(path.basename((fluxiq as Tenant).paths.root)),
    sweepIntervalMs: 0
  });
  cleanups.push(() => manager.close());

  const clock = { nowMs: 2_000 };
  const provider = new FakePaymentProvider({ webhookSecret: SECRET, now: () => clock.nowMs });
  const billing = new CommerceBillingService({
    ledger: new SQLiteCommerceLedger({ rootDir: path.join(root, "platform", "commerce"), now: () => clock.nowMs }),
    provider,
    policy: { allowTrial: false, graceMs: 1_000, retentionMs: 30_000 },
    refreshAfterMs: 500,
    now: () => clock.nowMs
  });
  const purged: Array<{ accountId: string; workspaceIds: readonly string[]; operationId: string }> = [];

  const identity = new IdentityAccessService({ repository: new MemoryRecordRepository(), passwordKdf: WEAK_KDF });
  const repository = new MemoryRecordRepository();
  const audit = new MemoryIamAuditSink();
  let services: PlatformServices | null = null;
  const ports = composeCascadePorts({
    primary,
    manager: () => manager,
    current: () => true,
    store: async () => services!.store,
    listActiveForUser: (userId) => trust.listActiveForUser(userId),
    billing: async () => billing,
    purgeEnvironments: async (request) => { purged.push(request); }
  });
  services = await createPlatformServices({
    ...ports,
    repository,
    iamRepository: repository,
    identity,
    email: new MemoryEmailSender(),
    auditSink: audit,
    publicOrigin: "https://app.example.test/",
    tenancy: { mode: "multi" },
    entitlements: { organisation: true }
  });
  const platform = services;

  await platform.store.putWorkspace({ workspaceId: ORG_B, kind: "organisation", ownerUserId: null, createdAtMs: 1 });
  (await manager.acquire(ORG_B)).release();
  let requests = 0;
  const run = <T extends Parameters<PlatformServices["provisioning"]["run"]>[0]>(operation: T, input: Record<string, unknown>) =>
    platform.provisioning.run(operation, { requestId: `cascade-${(requests += 1)}`, ...input }, FIXTURE);
  const createdIn = async (email: string, workspace: string, policy: string) => {
    const answer = await run("createAccount", { email, displayName: email, policies: [policy], workspace });
    if (!answer.ok || answer.result.status !== "created") throw new Error("fixture account was not created");
    return answer.result;
  };
  const adminB = await createdIn("admin-b@example.test", ORG_B, "FluxIQAdministratorAccess");
  const memberB = await createdIn("member-b@example.test", ORG_B, "FluxIQUserAccess");
  const person = await createdIn("person@example.test", "new", "FluxIQUserAccess");
  const added = await run("addMember", { userId: person.userId, workspaceId: ORG_B, policies: ["FluxIQUserAccess"] });
  if (!added.ok) throw new Error("fixture member was not added");
  const personal = person.workspaceId;
  (await manager.acquire(personal)).release();

  const pair = async (workspaceId: string, userId: string, label: string) => {
    const issued = await gateway(workspaceId).trust.issue({ clientId: `browser-${label}`, clientInstallId: `install-${label}`, clientType: "extension", name: "Synthetic browser", domainId: "web", approvedByUserId: userId, approvingSessionDigest: createHash("sha256").update(label).digest("hex") });
    return issued.trustedClientId;
  };
  const clientOf = (workspaceId: string, trustedClientId: string) => gateway(workspaceId).snapshot().trustedClients.find((client) => client.trustedClientId === trustedClientId);
  return { root, tenantRoot, manager, busy, provider, billing, purged, audit, platform, identity, run, adminB, memberB, person: person.userId, personal, pair, clientOf, clock };
}

describe("a suspended membership, composed", () => {
  it("revokes only the clients bound to the workspace it is suspended in, telling them revoked_by_admin", async () => {
    const w = await world();
    const inPersonal = await w.pair(w.personal, w.person, "personal");
    const inB = await w.pair(ORG_B, w.person, "org-b");
    const othersInB = await w.pair(ORG_B, w.memberB.userId, "member-b");
    expect(await w.run("suspendMember", { userId: w.person, workspaceId: ORG_B, reason: "Left the team" })).toMatchObject({ ok: true });
    expect(w.clientOf(ORG_B, inB)).toMatchObject({ status: "revoked", revokedFor: "revoked_by_admin" });
    expect(w.clientOf(w.personal, inPersonal)).toMatchObject({ status: "active" });
    expect(w.clientOf(ORG_B, othersInB)).toMatchObject({ status: "active" });
  });
});

describe("account disable and delete, composed", () => {
  it("disabling revokes every paired browser of the account, telling it account_disabled", async () => {
    const w = await world();
    const inPersonal = await w.pair(w.personal, w.person, "personal");
    const inB = await w.pair(ORG_B, w.person, "org-b");
    expect(await w.run("disableAccount", { userId: w.person, reason: "Review" })).toMatchObject({ ok: true });
    expect(w.clientOf(w.personal, inPersonal)).toMatchObject({ status: "revoked", revokedFor: "account_disabled" });
    expect(w.clientOf(ORG_B, inB)).toMatchObject({ status: "revoked", revokedFor: "account_disabled" });
  });

  it("deletes at once: clients told account_deleted, billing closed once, environments purged, the personal root gone, B untouched", async () => {
    const w = await world();
    const inPersonal = await w.pair(w.personal, w.person, "personal");
    const inB = await w.pair(ORG_B, w.person, "org-b");
    const othersInB = await w.pair(ORG_B, w.memberB.userId, "member-b");
    await subscribe(w);
    expect(existsSync(w.tenantRoot(w.personal))).toBe(true);

    const answer = await w.run("deleteAccount", { userId: w.person, mode: "immediate" });
    if (!answer.ok) throw new Error("expected an answer");
    expect(answer.result).toMatchObject({ status: "deleted", receipt: { workspaceIds: [w.personal] } });
    const receiptId = answer.result.receipt.receiptId;
    expect(w.clientOf(w.personal, inPersonal)).toMatchObject({ status: "revoked", revokedFor: "account_deleted" });
    expect(w.clientOf(ORG_B, inB)).toMatchObject({ status: "revoked", revokedFor: "account_deleted" });
    expect(w.clientOf(ORG_B, othersInB)).toMatchObject({ status: "active" });
    expect([...w.provider.cancellations.values()]).toEqual(["sub-person"]);
    expect(await w.billing.getEntitlement(w.person)).toMatchObject({ state: "ended" });
    expect(w.purged).toEqual([{ accountId: w.person, workspaceIds: [w.personal], operationId: receiptId }]);
    expect(existsSync(w.tenantRoot(w.personal))).toBe(false);
    expect(w.manager.get(w.personal)).toBeUndefined();
    expect(existsSync(w.tenantRoot(ORG_B))).toBe(true);
    expect(await w.platform.store.getMembership(ORG_B, w.memberB.userId)).toMatchObject({ status: "active", policies: ["FluxIQUserAccess"] });
    expect(await w.platform.store.getMembership(ORG_B, w.adminB.userId)).toMatchObject({ status: "active", policies: ["FluxIQAdministratorAccess"] });
    // B's audit names nothing of the deleted person's own workspace.
    const inBAudit = w.audit.records.filter((record) => JSON.stringify(record).includes(`:${ORG_B}:`));
    expect(inBAudit.length).toBeGreaterThan(0);
    expect(inBAudit.some((record) => JSON.stringify(record).includes(w.personal))).toBe(false);
  });

  it("answers scheduled while the personal workspace is busy, and the sweep completes the deletion after the run ends", async () => {
    const w = await world();
    w.busy.add(w.personal);
    const answer = await w.run("deleteAccount", { userId: w.person, mode: "immediate" });
    if (!answer.ok) throw new Error("expected an answer");
    expect(answer.result).toMatchObject({ status: "scheduled", receipt: { completedAt: null } });
    expect(existsSync(w.tenantRoot(w.personal))).toBe(true);
    expect(await w.platform.store.getAccount(w.person)).toMatchObject({ status: "deleted" });
    const lines: string[] = [];
    const sweep = startDeletionSweep(w.platform.provisioning, { log: (line) => lines.push(line) });
    try {
      await sweep.runNow();
      expect(await w.platform.store.getAccount(w.person)).not.toBeNull();
      w.busy.delete(w.personal);
      await sweep.runNow();
    } finally {
      await sweep.stop();
    }
    expect(lines).toEqual([]);
    expect(await w.platform.store.getAccount(w.person)).toBeNull();
    expect(existsSync(w.tenantRoot(w.personal))).toBe(false);
  });

  it("answers scheduled through a payment provider outage, and the retry completes it with one cancellation", async () => {
    const w = await world();
    await subscribe(w);
    w.provider.unavailable = true;
    const answer = await w.run("deleteAccount", { userId: w.person, mode: "immediate" });
    if (!answer.ok) throw new Error("expected an answer");
    expect(answer.result.status).toBe("scheduled");
    expect(existsSync(w.tenantRoot(w.personal))).toBe(true);
    w.provider.unavailable = false;
    expect(await w.platform.provisioning.runDueDeletions()).toBe(1);
    expect(w.provider.cancellations.size).toBe(1);
    expect(existsSync(w.tenantRoot(w.personal))).toBe(false);
  });
});

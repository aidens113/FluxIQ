import { describe, expect, it } from "vitest";
import { MemoryIamAuditSink } from "../../iam/index.ts";
import { IdentityAccessService } from "../../../programs/identity-access/index.ts";
import { MemoryEmailSender } from "../email/index.ts";
import { createPlatformServices } from "../service/index.ts";
import { accountInput } from "./provisioning-fixture.ts";
import { MemoryRecordRepository } from "./memory-record-repository.ts";

// An operation identity access refuses (the last enabled administrator) is
// decided before its first side effect: the refused call leaves the identity
// users and sessions, the connected clients, the memberships, the policy
// attachments and every stored row exactly as they were. With the real
// identity-access service; dummy values only; scrypt at N=2^10.

const WEAK_KDF = { testOnlyWeakParameters: { N: 2 ** 10, r: 8, p: 1, keyLength: 32 } as const };
const REFUSED = { ok: false, error: { code: "last_administrator", message: "The last enabled administrator cannot be disabled, deleted or demoted." } };
const ORGANISATION = "org-1";

async function harness() {
  const repository = new MemoryRecordRepository();
  const revokedSessions: string[] = [];
  const identity = new IdentityAccessService({ passwordKdf: WEAK_KDF, sessionRevocationSubscribers: [(sessionId) => void revokedSessions.push(sessionId)] });
  const audit = new MemoryIamAuditSink();
  const revokedClients: { userId: string; reason: string }[] = [];
  const deletedWorkspaces: string[] = [];
  const services = await createPlatformServices({
    repository,
    iamRepository: repository,
    identity,
    email: new MemoryEmailSender(),
    auditSink: audit,
    publicOrigin: "https://app.example.test/",
    tenancy: { mode: "multi" },
    entitlements: { organisation: true },
    revokeConnectedClients: async (userId, reason) => {
      revokedClients.push({ userId, reason });
      return 1;
    },
    deleteWorkspaceData: async (workspaceId) => {
      deletedWorkspaces.push(workspaceId);
    }
  });
  await services.store.putWorkspace({ workspaceId: ORGANISATION, kind: "organisation", ownerUserId: null, createdAtMs: 1 });
  const http = services.provisionerCaller("10.1.2.3");
  const snapshotAtMs = Date.now();

  /** Everything a refused call must leave alone. */
  async function observe() {
    return {
      rows: repository.snapshot(),
      identity: await identity.snapshot(snapshotAtMs),
      revokedSessions: [...revokedSessions],
      revokedClients: [...revokedClients],
      deletedWorkspaces: [...deletedWorkspaces],
      iamChanges: audit.records.filter((record) => record.category === "iam-change").length
    };
  }

  /** A new account as the last enabled administrator: the bootstrap administrator steps down. */
  async function lastAdministrator(policies: string[]): Promise<{ userId: string; workspaceId: string }> {
    const created = await services.provisioning.run("createAccount", accountInput({ policies }), http);
    if (!created.ok || created.result.status !== "created") throw new Error("expected created");
    const { userId, workspaceId } = created.result;
    // An administrator whose role was not set by a membership (the bootstrap or a claimed owner).
    if (!policies.includes("FluxIQAdministratorAccess")) await identity.updateUser({ id: userId, roleId: "admin" });
    await identity.updateUser({ id: "admin", enabled: false });
    await identity.createSession(userId);
    await identity.createSession(userId);
    return { userId, workspaceId };
  }

  return { services, identity, http, observe, lastAdministrator, revokedClients };
}

describe("a refused provisioning operation changes nothing", () => {
  it("deleteAccount immediate on the last administrator keeps its sessions, clients and rows", async () => {
    const { services, http, observe, lastAdministrator } = await harness();
    const { userId } = await lastAdministrator(["FluxIQAdministratorAccess"]);
    const before = await observe();
    expect(before.identity.sessions.filter((session) => session.userId === userId)).toHaveLength(2);

    expect(await services.provisioning.run("deleteAccount", { requestId: "del-i", userId, mode: "immediate" }, http)).toEqual(REFUSED);
    expect(await observe()).toEqual(before);
  });

  it("deleteAccount scheduled, disableAccount and a demoting setPolicies change nothing either", async () => {
    const { services, http, observe, lastAdministrator } = await harness();
    const { userId, workspaceId } = await lastAdministrator(["FluxIQAdministratorAccess"]);
    const before = await observe();

    expect(await services.provisioning.run("deleteAccount", { requestId: "del-s", userId, mode: "scheduled" }, http)).toEqual(REFUSED);
    expect(await services.provisioning.run("disableAccount", { requestId: "d1", userId, reason: "Review" }, http)).toEqual(REFUSED);
    expect(await services.provisioning.run("setPolicies", { requestId: "sp1", userId, workspaceId, policies: ["FluxIQUserAccess"] }, http)).toEqual(REFUSED);
    expect(await observe()).toEqual(before);
  });

  it("addMember that would demote the last administrator writes no membership", async () => {
    const { services, identity, http, observe, lastAdministrator } = await harness();
    const { userId } = await lastAdministrator(["FluxIQUserAccess"]);
    const before = await observe();

    expect(await services.provisioning.run("addMember", { requestId: "m1", userId, workspaceId: ORGANISATION, policies: ["FluxIQReadOnlyAccess"] }, http)).toEqual(REFUSED);
    expect(await observe()).toEqual(before);
    expect(await services.store.getMembership(ORGANISATION, userId)).toBeNull();

    // The new membership's own policies count: one that keeps the administrator is added.
    const added = await services.provisioning.run("addMember", { requestId: "m2", userId, workspaceId: ORGANISATION, policies: ["FluxIQAdministratorAccess"] }, http);
    expect(added).toEqual({ ok: true, result: { status: "added", userId, workspaceId: ORGANISATION, policies: ["FluxIQAdministratorAccess"] } });
    expect((await identity.snapshot()).users.find((user) => user.id === userId)).toMatchObject({ enabled: true, roleId: "admin" });
  });

  it("addMember re-adding a removed membership that would demote changes nothing", async () => {
    const { services, http, observe, lastAdministrator } = await harness();
    const { userId } = await lastAdministrator(["FluxIQUserAccess"]);
    await services.store.putMembership({ workspaceId: ORGANISATION, userId, policies: ["FluxIQAdministratorAccess"], groups: [], status: "removed", createdAtMs: 1, updatedAtMs: 1 });
    const before = await observe();

    expect(await services.provisioning.run("addMember", { requestId: "m1", userId, workspaceId: ORGANISATION, policies: ["FluxIQUserAccess"] }, http)).toEqual(REFUSED);
    expect(await observe()).toEqual(before);
  });

  it("deleteAccount immediate still revokes sessions and clients and deletes when it is allowed", async () => {
    const { services, identity, http, revokedClients } = await harness();
    const created = await services.provisioning.run("createAccount", accountInput(), http);
    if (!created.ok || created.result.status !== "created") throw new Error("expected created");
    const { userId } = created.result;
    await identity.createSession(userId);

    const deleted = await services.provisioning.run("deleteAccount", { requestId: "del-i", userId, mode: "immediate" }, http);
    expect(deleted.ok && deleted.result.status).toBe("deleted");
    const snapshot = await identity.snapshot();
    expect(snapshot.users.some((user) => user.id === userId)).toBe(false);
    expect(snapshot.sessions.some((session) => session.userId === userId)).toBe(false);
    expect(revokedClients).toEqual([{ userId, reason: "account_deleted" }]);
    expect(await services.store.getAccount(userId)).toBeNull();
  });
});

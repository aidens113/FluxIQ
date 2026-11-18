import { describe, expect, it } from "vitest";
import { iamPrincipalFrn } from "../../iam/index.ts";
import { accountInput, createProvisioningHarness, type ProvisioningHarness } from "./provisioning-fixture.ts";

// One membership, one workspace: suspending, resuming and removing a person in
// one organisation workspace leaves their account, their sign-in and their
// other workspace as they were, and revokes only the clients bound to the
// workspace they lose.

const ORG_A = "org-a";
const ORG_B = "org-b";

async function twoOrganisations() {
  const harness = await createProvisioningHarness({ organisation: true });
  for (const workspaceId of [ORG_A, ORG_B]) await harness.services.store.putWorkspace({ workspaceId, kind: "organisation", ownerUserId: null, createdAtMs: 1 });
  const person = async (email: string, workspace: string, policy: string) => {
    const answer = await harness.services.provisioning.run("createAccount", accountInput({ requestId: `create-${email.split("@")[0]}`, email, policies: [policy], workspace }), harness.inProcess);
    if (!answer.ok || answer.result.status !== "created") throw new Error("expected created");
    return answer.result.userId;
  };
  const adminA = await person("admin-a@example.test", ORG_A, "FluxIQAdministratorAccess");
  const shared = await person("shared@example.test", ORG_A, "FluxIQUserAccess");
  const added = await harness.services.provisioning.run("addMember", { requestId: "add-shared-b", userId: shared, workspaceId: ORG_B, policies: ["FluxIQAdministratorAccess"] }, harness.inProcess);
  if (!added.ok) throw new Error("expected added");
  harness.identity.sessions.set(shared, 1);
  harness.revokedClients.length = 0;
  harness.steps.length = 0;
  return { harness, adminA, shared };
}

async function attached(harness: ProvisioningHarness, workspaceId: string, userId: string): Promise<string[]> {
  return harness.services.workspaceIam(workspaceId).listAttachedPolicies(iamPrincipalFrn("user", workspaceId, userId));
}

describe("suspendMember and resumeMember", () => {
  it("suspends one membership only, revokes only that workspace's clients, and resumes it with the same policies", async () => {
    const { harness, shared } = await twoOrganisations();
    const suspended = await harness.services.provisioning.run("suspendMember", { requestId: "s1", userId: shared, workspaceId: ORG_A, reason: "Left the project" }, harness.http);
    expect(suspended).toEqual({ ok: true, result: { status: "suspended", userId: shared, workspaceId: ORG_A } });
    expect(await harness.services.store.getMembership(ORG_A, shared)).toMatchObject({ status: "suspended", policies: ["FluxIQUserAccess"] });
    expect(await attached(harness, ORG_A, shared)).toEqual([]);
    expect(await harness.services.store.getMembership(ORG_B, shared)).toMatchObject({ status: "active", policies: ["FluxIQAdministratorAccess"] });
    expect(await attached(harness, ORG_B, shared)).toEqual(["FluxIQAdministratorAccess"]);
    expect(harness.revokedClients).toEqual([{ userId: shared, reason: "revoked_by_admin", workspaceId: ORG_A }]);
    expect(harness.droppedCustody).toEqual([{ workspaceId: ORG_A, userId: shared }]);
    // The account and its sign-in are untouched; the identity role comes from the workspace still active.
    expect(await harness.services.store.getAccount(shared)).toMatchObject({ status: "active", deletion: null });
    expect(harness.identity.users.get(shared)).toMatchObject({ enabled: true, roleId: "admin" });
    expect(harness.identity.sessions.get(shared)).toBe(1);
    const read = await harness.services.provisioning.run("getAccount", { userId: shared }, harness.http);
    expect(read.ok && read.result.workspaceIds).toEqual([ORG_B]);

    const again = await harness.services.provisioning.run("suspendMember", { requestId: "s2", userId: shared, workspaceId: ORG_A, reason: "Again" }, harness.http);
    expect(again.ok === false && again.error.code).toBe("not_found");

    const resumed = await harness.services.provisioning.run("resumeMember", { requestId: "r1", userId: shared, workspaceId: ORG_A, reason: "Back on the project" }, harness.http);
    expect(resumed).toEqual({ ok: true, result: { status: "resumed", userId: shared, workspaceId: ORG_A, policies: ["FluxIQUserAccess"] } });
    expect(await harness.services.store.getMembership(ORG_A, shared)).toMatchObject({ status: "active", policies: ["FluxIQUserAccess"] });
    expect(await attached(harness, ORG_A, shared)).toEqual(["FluxIQUserAccess"]);
    expect(harness.revokedClients).toHaveLength(1);
  });

  it("refuses to resume a disabled account's membership, and one that is not suspended", async () => {
    const { harness, shared } = await twoOrganisations();
    expect((await harness.services.provisioning.run("suspendMember", { requestId: "s1", userId: shared, workspaceId: ORG_A, reason: "x" }, harness.http)).ok).toBe(true);
    const notSuspended = await harness.services.provisioning.run("resumeMember", { requestId: "r0", userId: shared, workspaceId: ORG_B, reason: "x" }, harness.http);
    expect(notSuspended.ok === false && notSuspended.error.code).toBe("not_found");
    expect((await harness.services.provisioning.run("disableAccount", { requestId: "d1", userId: shared, reason: "Review" }, harness.http)).ok).toBe(true);
    const disabled = await harness.services.provisioning.run("resumeMember", { requestId: "r1", userId: shared, workspaceId: ORG_A, reason: "x" }, harness.http);
    expect(disabled.ok === false && disabled.error.code).toBe("disabled");
    expect(await harness.services.store.getMembership(ORG_A, shared)).toMatchObject({ status: "suspended" });
  });
});

describe("removeMember", () => {
  it("ends one membership, active or suspended, and leaves the account and the other workspace untouched", async () => {
    const { harness, shared } = await twoOrganisations();
    const removed = await harness.services.provisioning.run("removeMember", { requestId: "rm1", userId: shared, workspaceId: ORG_A }, harness.http);
    expect(removed).toEqual({ ok: true, result: { status: "removed", userId: shared, workspaceId: ORG_A } });
    expect(await harness.services.store.getMembership(ORG_A, shared)).toMatchObject({ status: "removed", policies: [] });
    expect(await attached(harness, ORG_A, shared)).toEqual([]);
    expect(await harness.services.store.getMembership(ORG_B, shared)).toMatchObject({ status: "active", policies: ["FluxIQAdministratorAccess"] });
    expect(await harness.services.store.getAccount(shared)).toMatchObject({ status: "active" });
    expect(harness.revokedClients).toEqual([{ userId: shared, reason: "revoked_by_admin", workspaceId: ORG_A }]);
    const resume = await harness.services.provisioning.run("resumeMember", { requestId: "r1", userId: shared, workspaceId: ORG_A, reason: "x" }, harness.http);
    expect(resume.ok === false && resume.error.code).toBe("not_found");
  });

  it("removes a suspended membership", async () => {
    const { harness, shared } = await twoOrganisations();
    expect((await harness.services.provisioning.run("suspendMember", { requestId: "s1", userId: shared, workspaceId: ORG_A, reason: "x" }, harness.http)).ok).toBe(true);
    expect(await harness.services.provisioning.run("removeMember", { requestId: "rm1", userId: shared, workspaceId: ORG_A }, harness.http)).toMatchObject({ ok: true, result: { status: "removed" } });
    expect(await harness.services.store.getMembership(ORG_A, shared)).toMatchObject({ status: "removed", policies: [] });
  });
});

describe("what a membership operation refuses, changing nothing", () => {
  it("refuses to suspend or remove a workspace's last administrator", async () => {
    const { harness, adminA, shared } = await twoOrganisations();
    for (const [operation, input] of [
      ["suspendMember", { requestId: "s1", userId: adminA, workspaceId: ORG_A, reason: "x" }],
      ["removeMember", { requestId: "rm1", userId: adminA, workspaceId: ORG_A }]
    ] as const) {
      const answer = await harness.services.provisioning.run(operation, input, harness.http);
      expect([operation, answer.ok === false && answer.error.code]).toEqual([operation, "last_administrator"]);
    }
    expect(await harness.services.store.getMembership(ORG_A, adminA)).toMatchObject({ status: "active", policies: ["FluxIQAdministratorAccess"] });
    expect(await attached(harness, ORG_A, adminA)).toEqual(["FluxIQAdministratorAccess"]);
    expect(harness.revokedClients).toEqual([]);
    expect(harness.droppedCustody).toEqual([]);
    // B's only administrator is the shared person: suspending them in B is refused too, A stays as it was.
    const lastInB = await harness.services.provisioning.run("suspendMember", { requestId: "s2", userId: shared, workspaceId: ORG_B, reason: "x" }, harness.http);
    expect(lastInB.ok === false && lastInB.error.code).toBe("last_administrator");
  });

  it("refuses a personal workspace, a workspace the person is not in, and an unknown account", async () => {
    const harness = await createProvisioningHarness({ organisation: true });
    const created = await harness.services.provisioning.run("createAccount", accountInput(), harness.inProcess);
    if (!created.ok || created.result.status !== "created") throw new Error("expected created");
    const { userId, workspaceId } = created.result;
    expect(await harness.services.provisioning.run("suspendMember", { requestId: "s-p", userId, workspaceId, reason: "x" }, harness.http)).toMatchObject({ ok: false, error: { code: "not_found" } });
    expect(await harness.services.provisioning.run("removeMember", { requestId: "rm-p", userId, workspaceId }, harness.http)).toMatchObject({ ok: false, error: { code: "not_found" } });
    await harness.services.store.putWorkspace({ workspaceId: ORG_A, kind: "organisation", ownerUserId: null, createdAtMs: 1 });
    expect(await harness.services.provisioning.run("removeMember", { requestId: "rm-o", userId, workspaceId: ORG_A }, harness.http)).toMatchObject({ ok: false, error: { code: "not_found" } });
    expect(await harness.services.provisioning.run("suspendMember", { requestId: "s-u", userId: "nobody", workspaceId: ORG_A, reason: "x" }, harness.http)).toMatchObject({ ok: false, error: { code: "not_found" } });
    expect(await harness.services.store.getMembership(workspaceId, userId)).toMatchObject({ status: "active" });
    expect(harness.revokedClients).toEqual([]);
  });
});

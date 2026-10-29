import { describe, expect, it } from "vitest";
import { iamPrincipalFrn } from "../../iam/index.ts";
import { accountInput, createProvisioningHarness, type ProvisioningHarness } from "./provisioning-fixture.ts";

async function created(harness: ProvisioningHarness, overrides: Record<string, unknown> = {}): Promise<{ userId: string; workspaceId: string }> {
  const answer = await harness.services.provisioning.run("createAccount", accountInput(overrides), harness.http);
  if (!answer.ok || answer.result.status !== "created") throw new Error("expected created");
  return { userId: answer.result.userId, workspaceId: answer.result.workspaceId };
}

describe("disableAccount and enableAccount", () => {
  it("disables sign-in, revokes sessions and connected clients, then enables again", async () => {
    const harness = await createProvisioningHarness();
    const { userId } = await created(harness);
    harness.identity.sessions.set(userId, 2);
    const disabled = await harness.services.provisioning.run("disableAccount", { requestId: "d1", userId, reason: "Chargeback review" }, harness.http);
    expect(disabled).toEqual({ ok: true, result: { status: "disabled", userId } });
    expect(harness.identity.users.get(userId)?.enabled).toBe(false);
    expect(harness.identity.sessions.get(userId)).toBe(0);
    expect(harness.revokedClients).toEqual([{ userId, reason: "account_disabled" }]);
    expect(await harness.services.store.getAccount(userId)).toMatchObject({ status: "disabled", disabledReason: "Chargeback review" });

    const enabled = await harness.services.provisioning.run("enableAccount", { requestId: "e1", userId, reason: "Cleared" }, harness.http);
    expect(enabled).toEqual({ ok: true, result: { status: "enabled", userId } });
    expect(harness.identity.users.get(userId)?.enabled).toBe(true);
    expect(await harness.services.store.getAccount(userId)).toMatchObject({ status: "active", disabledReason: null });
  });

  it("answers not_found for an unknown account", async () => {
    const harness = await createProvisioningHarness();
    const answer = await harness.services.provisioning.run("disableAccount", { requestId: "d1", userId: "nobody", reason: "x" }, harness.http);
    expect(answer.ok === false && answer.error.code).toBe("not_found");
  });
});

describe("setPassword, setPolicies and addMember", () => {
  it("sets a password in-process and revokes the sessions", async () => {
    const harness = await createProvisioningHarness();
    const { userId } = await created(harness);
    harness.identity.sessions.set(userId, 4);
    const answer = await harness.services.provisioning.run("setPassword", { requestId: "p1", userId, password: "an entirely new password" }, harness.inProcess);
    expect(answer).toEqual({ ok: true, result: { status: "updated", sessionsRevoked: 4 } });
    expect(harness.identity.users.get(userId)?.password).toBe("an entirely new password");
    const weak = await harness.services.provisioning.run("setPassword", { requestId: "p2", userId, password: "short" }, harness.inProcess);
    expect(weak.ok === false && weak.error.code).toBe("weak_password");
  });

  it("replaces a member's attachments and its interim identity role", async () => {
    const harness = await createProvisioningHarness();
    const { userId, workspaceId } = await created(harness);
    const answer = await harness.services.provisioning.run("setPolicies", { requestId: "sp1", userId, workspaceId, policies: ["FluxIQAdministratorAccess"] }, harness.http);
    expect(answer).toEqual({ ok: true, result: { status: "updated", userId, workspaceId, policies: ["FluxIQAdministratorAccess"] } });
    expect(harness.identity.users.get(userId)?.roleId).toBe("admin");
    expect((await harness.services.store.getMembership(workspaceId, userId))?.policies).toEqual(["FluxIQAdministratorAccess"]);
    const actions = harness.audit.records.filter((record) => record.category === "iam-change" && record.resources[0] === iamPrincipalFrn("user", workspaceId, userId)).map((record) => record.action);
    expect(actions).toEqual(["iam:AttachUserPolicy", "iam:DetachUserPolicy", "iam:AttachUserPolicy"]);

    const owner = await harness.services.provisioning.run("setPolicies", { requestId: "sp2", userId, workspaceId, policies: ["FluxIQOwnerFullAccess"] }, harness.inProcess);
    expect(owner.ok === false && owner.error.code).toBe("forbidden_policy");
    const elsewhere = await harness.services.provisioning.run("setPolicies", { requestId: "sp3", userId, workspaceId: "other", policies: ["FluxIQUserAccess"] }, harness.http);
    expect(elsewhere.ok === false && elsewhere.error.code).toBe("not_found");
  });

  it("adds a member to an organisation workspace only with the entitlement", async () => {
    const refused = await createProvisioningHarness();
    const plain = await created(refused);
    const noEntitlement = await refused.services.provisioning.run("addMember", { requestId: "m1", userId: plain.userId, workspaceId: "org-1", policies: ["FluxIQUserAccess"] }, refused.http);
    expect(noEntitlement.ok === false && noEntitlement.error.code).toBe("entitlement_required");

    const harness = await createProvisioningHarness({ organisation: true });
    const { userId, workspaceId } = await created(harness);
    await harness.services.store.putWorkspace({ workspaceId: "org-1", kind: "organisation", ownerUserId: null, createdAtMs: 1 });
    const added = await harness.services.provisioning.run("addMember", { requestId: "m1", userId, workspaceId: "org-1", policies: ["FluxIQReadOnlyAccess"] }, harness.http);
    expect(added).toEqual({ ok: true, result: { status: "added", userId, workspaceId: "org-1", policies: ["FluxIQReadOnlyAccess"] } });
    const again = await harness.services.provisioning.run("addMember", { requestId: "m2", userId, workspaceId: "org-1", policies: ["FluxIQAdministratorAccess"] }, harness.http);
    expect(again).toEqual({ ok: true, result: { status: "already_member", userId, workspaceId: "org-1", policies: ["FluxIQReadOnlyAccess"] } });
    const personal = await harness.services.provisioning.run("addMember", { requestId: "m3", userId, workspaceId, policies: ["FluxIQUserAccess"] }, harness.http);
    expect(personal.ok === false && personal.error.code).toBe("not_found");
  });
});

describe("rotateCredentials and getAccount", () => {
  it("revokes by scope and mails a reset link for password", async () => {
    const harness = await createProvisioningHarness();
    const { userId } = await created(harness);
    harness.identity.sessions.set(userId, 3);
    const sessions = await harness.services.provisioning.run("rotateCredentials", { requestId: "r1", userId, scope: "sessions" }, harness.http);
    expect(sessions).toEqual({ ok: true, result: { status: "rotated", userId, sessionsRevoked: 3, connectedClientsRevoked: 0, resetSent: false } });
    harness.identity.sessions.set(userId, 1);
    const all = await harness.services.provisioning.run("rotateCredentials", { requestId: "r2", userId, scope: "all" }, harness.http);
    expect(all).toEqual({ ok: true, result: { status: "rotated", userId, sessionsRevoked: 1, connectedClientsRevoked: 2, resetSent: true } });
    expect(harness.revokedClients).toEqual([{ userId, reason: "credentials_rotated" }]);
    expect(harness.email.messages.at(-1)?.template).toBe("password-reset");
  });

  it("returns the visible account by any key, with sign-in time, and never a hash or policy", async () => {
    const harness = await createProvisioningHarness();
    const { userId, workspaceId } = await created(harness, { externalId: "site-42" });
    expect(await harness.services.provisioning.recordSignIn(userId, harness.clock.nowMs + 5)).toBe(true);
    expect(await harness.services.provisioning.recordSignIn("nobody")).toBe(false);
    const expected = { userId, email: "person@example.test", status: "active", workspaceIds: [workspaceId], createdAt: harness.clock.nowMs, lastSignInAt: harness.clock.nowMs + 5 };
    for (const input of [{ userId }, { email: "PERSON@example.test" }, { externalId: "site-42" }]) {
      expect(await harness.services.provisioning.run("getAccount", input, harness.http)).toEqual({ ok: true, result: expected });
    }
    const missing = await harness.services.provisioning.run("getAccount", { email: "nobody@example.test" }, harness.http);
    expect(missing.ok === false && missing.error.code).toBe("not_found");
  });
});

describe("deleteAccount", () => {
  it("deletes at once with a receipt, removing the identity user, workspace data and platform rows", async () => {
    const harness = await createProvisioningHarness();
    const { userId, workspaceId } = await created(harness, { sendWelcome: true });
    const answer = await harness.services.provisioning.run("deleteAccount", { requestId: "del-1", userId, mode: "immediate" }, harness.http);
    expect(answer).toEqual({
      ok: true,
      result: {
        status: "deleted",
        receipt: { receiptId: expect.any(String), userId, mode: "immediate", requestedAt: harness.clock.nowMs, scheduledFor: null, completedAt: harness.clock.nowMs, workspaceIds: [workspaceId] }
      }
    });
    expect(harness.identity.users.has(userId)).toBe(false);
    expect(harness.deletedWorkspaces).toEqual([workspaceId]);
    expect(harness.revokedClients).toEqual([{ userId, reason: "account_deleted" }]);
    expect(await harness.services.store.getAccount(userId)).toBeNull();
    expect(await harness.services.store.getWorkspace(workspaceId)).toBeNull();
    expect(await harness.services.store.listMembershipsOfUser(userId)).toEqual([]);
    expect(harness.audit.records.at(-1)).toMatchObject({ category: "iam-change", action: "iam:DetachUserPolicy" });
    expect(await harness.services.provisioning.run("deleteAccount", { requestId: "del-1", userId, mode: "immediate" }, harness.http)).toEqual(answer);
  });

  it("schedules a deletion for seven days, disabling at once, then completes it in the sweep", async () => {
    const harness = await createProvisioningHarness();
    const { userId, workspaceId } = await created(harness);
    const answer = await harness.services.provisioning.run("deleteAccount", { requestId: "del-1", userId, mode: "scheduled" }, harness.http);
    if (!answer.ok) throw new Error("expected scheduled");
    expect(answer.result).toMatchObject({ status: "scheduled", receipt: { mode: "scheduled", completedAt: null, scheduledFor: harness.clock.nowMs + 7 * 24 * 3600_000, workspaceIds: [workspaceId] } });
    expect(harness.identity.users.get(userId)?.enabled).toBe(false);
    expect((await harness.services.store.getAccount(userId))?.status).toBe("deleted");
    const enable = await harness.services.provisioning.run("enableAccount", { requestId: "e1", userId, reason: "x" }, harness.http);
    expect(enable.ok === false && enable.error.code).toBe("not_found");
    const repeat = await harness.services.provisioning.run("deleteAccount", { requestId: "del-2", userId, mode: "scheduled" }, harness.http);
    expect(repeat.ok && repeat.result.receipt.receiptId).toBe(answer.result.receipt.receiptId);

    expect(await harness.services.provisioning.runDueDeletions(harness.clock.nowMs + 1000)).toBe(0);
    expect(await harness.services.provisioning.runDueDeletions(harness.clock.nowMs + 7 * 24 * 3600_000)).toBe(1);
    expect(harness.identity.users.has(userId)).toBe(false);
    expect(await harness.services.store.getAccount(userId)).toBeNull();
    expect(harness.deletedWorkspaces).toEqual([workspaceId]);
  });
});

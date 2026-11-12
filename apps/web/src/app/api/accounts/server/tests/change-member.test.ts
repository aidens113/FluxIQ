import { describe, expect, it } from "vitest";
import { changeMember } from "../change-member";
import { inviteMember } from "../invite-member";
import { createAccountsHarness, DUMMY_PASSWORD, type AccountsHarness } from "./accounts-harness";

const PROOF = { password: DUMMY_PASSWORD };

async function invite(harness: AccountsHarness, email: string): Promise<string> {
  const answer = await inviteMember(await harness.deps(harness.admin), { email, displayName: "Invited", role: "read-only", proof: PROOF });
  if (answer.status !== 200) throw new Error(`invite failed: ${answer.status}`);
  return (answer.body as { payload: { userId: string } }).payload.userId;
}

async function identityUser(harness: AccountsHarness, userId: string) {
  return (await harness.identityAccess.snapshot()).users.find((user) => user.id === userId);
}

describe("changeMember", () => {
  it("changes a role through provisioning, keeping the membership and the sign-in role in step", async () => {
    const harness = await createAccountsHarness();
    const other = await harness.addPerson("other@example.test", "FluxIQAdministratorAccess");
    const answer = await changeMember(await harness.deps(harness.admin), { action: "set-role", userId: other.userId, role: "read-only", proof: PROOF });
    expect(answer).toEqual({ status: 200, body: { ok: true } });
    expect((await harness.services.store.getMembership("workspace-main", other.userId))?.policies).toEqual(["FluxIQReadOnlyAccess"]);
    expect((await identityUser(harness, other.userId))?.roleId).toBe("viewer");
  });

  it("turns a person off (ending their sessions) and on again", async () => {
    const harness = await createAccountsHarness();
    const deps = await harness.deps(harness.admin);
    expect((await changeMember(deps, { action: "turn-off", userId: harness.viewer.userId, proof: PROOF })).status).toBe(200);
    expect((await identityUser(harness, harness.viewer.userId))?.enabled).toBe(false);
    expect(await harness.identityAccess.validateSession(harness.viewer.sessionId)).toBeNull();
    expect((await changeMember(deps, { action: "turn-on", userId: harness.viewer.userId, proof: PROOF })).status).toBe(200);
    expect((await identityUser(harness, harness.viewer.userId))?.enabled).toBe(true);
  });

  it("removes a person by deleting their account in the one workspace", async () => {
    const harness = await createAccountsHarness();
    const answer = await changeMember(await harness.deps(harness.admin), { action: "remove", userId: harness.viewer.userId, proof: PROOF });
    expect(answer.status).toBe(200);
    expect(await harness.services.store.getAccount(harness.viewer.userId)).toBeNull();
    expect(await identityUser(harness, harness.viewer.userId)).toBeUndefined();
  });

  it("resends a pending invite with a new link, and revokes it", async () => {
    const harness = await createAccountsHarness();
    const userId = await invite(harness, "pending@example.test");
    const deps = await harness.deps(harness.admin);
    const first = harness.email.messages.at(-1)?.variables.welcomeUrl;
    const resent = await changeMember(deps, { action: "resend-invite", userId });
    expect(resent).toEqual({ status: 200, body: { ok: true } });
    const second = harness.email.messages.at(-1)?.variables.welcomeUrl;
    expect(second).toBeDefined();
    expect(second).not.toBe(first);
    expect(JSON.stringify(resent)).not.toContain(new URL(second ?? "https://x/").hash.slice(1));
    expect((await changeMember(deps, { action: "revoke-invite", userId, proof: PROOF })).status).toBe(200);
    expect(await harness.services.store.getAccount(userId)).toBeNull();
  });

  it("refuses to resend or revoke the invite of someone already in", async () => {
    const harness = await createAccountsHarness();
    const deps = await harness.deps(harness.admin);
    for (const action of ["resend-invite", "revoke-invite"]) {
      const answer = await changeMember(deps, { action, userId: harness.viewer.userId, proof: PROOF });
      expect([action, answer.status, (answer.body as { code?: string }).code]).toEqual([action, 409, "not_invited"]);
    }
    expect(await harness.services.store.getAccount(harness.viewer.userId)).not.toBeNull();
  });

  it("denies every change to a viewer, and changes nothing", async () => {
    const harness = await createAccountsHarness();
    const deps = await harness.deps(harness.viewer);
    for (const action of ["set-role", "turn-off", "turn-on", "remove", "resend-invite", "revoke-invite"]) {
      const answer = await changeMember(deps, { action, userId: harness.admin.userId, role: "read-only", proof: PROOF });
      expect([action, answer.status, (answer.body as { code?: string }).code]).toEqual([action, 403, "forbidden"]);
    }
    expect((await harness.services.store.getMembership("workspace-main", harness.admin.userId))?.policies).toEqual(["FluxIQAdministratorAccess"]);
    expect((await identityUser(harness, harness.admin.userId))?.enabled).toBe(true);
  });

  it("never changes the caller's own access or the owner's", async () => {
    const harness = await createAccountsHarness();
    const deps = await harness.deps(harness.admin);
    expect((await changeMember(deps, { action: "set-role", userId: harness.admin.userId, role: "read-only", proof: PROOF })).body).toMatchObject({ code: "self" });
    expect((await changeMember(deps, { action: "turn-off", userId: harness.owner.userId, proof: PROOF })).body).toMatchObject({ code: "owner" });
    expect((await changeMember(deps, { action: "remove", userId: harness.owner.userId, proof: PROOF })).body).toMatchObject({ code: "owner" });
    expect(await harness.services.store.getAccount(harness.owner.userId)).not.toBeNull();
  });

  it("asks for proof before a change that moves authority, and refuses a wrong one", async () => {
    const harness = await createAccountsHarness();
    const deps = await harness.deps(harness.admin);
    const missing = await changeMember(deps, { action: "turn-off", userId: harness.viewer.userId });
    expect(missing.body).toMatchObject({ code: "recheck", requiresRecheck: true });
    const wrong = await changeMember(deps, { action: "set-role", userId: harness.viewer.userId, role: "administrator", proof: { password: "wrong dummy password" } });
    expect(wrong.body).toMatchObject({ code: "recheck", requiresRecheck: true });
    expect((await harness.services.store.getMembership("workspace-main", harness.viewer.userId))?.policies).toEqual(["FluxIQReadOnlyAccess"]);
  });

  it("refuses an unknown change, an unknown person and a role that cannot be given", async () => {
    const harness = await createAccountsHarness();
    const deps = await harness.deps(harness.admin);
    expect((await changeMember(deps, { action: "make-owner", userId: harness.viewer.userId })).status).toBe(400);
    expect((await changeMember(deps, { action: "turn-off", userId: "nobody", proof: PROOF })).status).toBe(404);
    expect((await changeMember(deps, { action: "set-role", userId: harness.viewer.userId, role: "owner", proof: PROOF })).status).toBe(400);
  });

  it("on service, an administrator's policies allow a change and a member's do not, even on themselves", async () => {
    const harness = await createAccountsHarness();
    const member = await harness.addPerson("worker@example.test", "FluxIQUserAccess");
    const allowed = await changeMember(await harness.deps(harness.admin, "service"), { action: "set-role", userId: harness.viewer.userId, role: "member", proof: PROOF });
    expect(allowed.status).toBe(200);
    const self = await changeMember(await harness.deps(member, "service"), { action: "set-role", userId: member.userId, role: "administrator", proof: PROOF });
    expect(self).toMatchObject({ status: 403, body: { code: "forbidden" } });
    expect((await harness.services.store.getMembership("workspace-main", member.userId))?.policies).toEqual(["FluxIQUserAccess"]);
  });
});

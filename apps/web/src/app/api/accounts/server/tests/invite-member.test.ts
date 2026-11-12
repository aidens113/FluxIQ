import { describe, expect, it } from "vitest";
import { inviteMember } from "../invite-member";
import { listMembers } from "../list-members";
import { createAccountsHarness, DUMMY_PASSWORD } from "./accounts-harness";

const PROOF = { password: DUMMY_PASSWORD };

function tokenOf(url: string | undefined): string {
  if (url === undefined) throw new Error("no welcome link was sent");
  return new URL(url).hash.replace(/^#token=/u, "");
}

describe("inviteMember", () => {
  it("creates the account with the role's one policy, emails the welcome link, and never answers the token", async () => {
    const harness = await createAccountsHarness();
    const deps = await harness.deps(harness.admin);
    const answer = await inviteMember(deps, { email: "New.Person@Example.test", displayName: "New Person", role: "read-only", proof: PROOF });
    expect(answer.status).toBe(200);
    const userId = (answer.body as { payload: { userId: string } }).payload.userId;
    expect((await harness.services.store.getMembership("workspace-main", userId))?.policies).toEqual(["FluxIQReadOnlyAccess"]);
    const sent = harness.email.messages.at(-1);
    expect(sent?.template).toBe("welcome");
    expect(sent?.to).toBe("new.person@example.test");
    const token = tokenOf(sent?.variables.welcomeUrl);
    expect(token.length).toBeGreaterThan(20);
    expect(JSON.stringify(answer)).not.toContain(token);
    const listed = await listMembers(deps);
    expect(JSON.stringify(listed)).not.toContain(token);
    const row = (listed.body as { payload: { members: { userId: string; state: string; role: string }[] } }).payload.members.find((member) => member.userId === userId);
    expect(row).toMatchObject({ state: "invited", role: "read-only" });
  });

  it("refuses a viewer before asking for any proof, and sends nothing", async () => {
    const harness = await createAccountsHarness();
    const before = harness.email.messages.length;
    const answer = await inviteMember(await harness.deps(harness.viewer), { email: "x@example.test", displayName: "X", role: "read-only", proof: PROOF });
    expect(answer).toEqual({ status: 403, body: { ok: false, code: "forbidden", error: "Permission required: identity.manage" } });
    expect(harness.email.messages.length).toBe(before);
    expect(await harness.services.store.findAccountByEmail("x@example.test")).toBeNull();
  });

  it("asks the administrator to re-prove themselves, and refuses a wrong password, creating nothing", async () => {
    const harness = await createAccountsHarness();
    const deps = await harness.deps(harness.admin);
    const missing = await inviteMember(deps, { email: "x@example.test", displayName: "X", role: "read-only" });
    expect(missing.status).toBe(403);
    expect(missing.body).toMatchObject({ ok: false, code: "recheck", requiresRecheck: true });
    const wrong = await inviteMember(deps, { email: "x@example.test", displayName: "X", role: "read-only", proof: { password: "not the password at all" } });
    expect(wrong.body).toMatchObject({ ok: false, code: "recheck", requiresRecheck: true });
    expect(JSON.stringify(wrong)).not.toContain("not the password at all");
    expect(await harness.services.store.findAccountByEmail("x@example.test")).toBeNull();
  });

  it("never gives the owner role, nor a role the profile does not offer", async () => {
    const harness = await createAccountsHarness();
    const deps = await harness.deps(harness.admin);
    for (const role of ["owner", "member", "FluxIQOwnerFullAccess", undefined]) {
      const answer = await inviteMember(deps, { email: "x@example.test", displayName: "X", role, proof: PROOF });
      expect([role, answer.status, (answer.body as { code?: string }).code]).toEqual([role, 400, "invalid_input"]);
    }
  });

  it("says plainly when the email already has an account", async () => {
    const harness = await createAccountsHarness();
    const answer = await inviteMember(await harness.deps(harness.admin), { email: "viewer@example.test", displayName: "V", role: "read-only", proof: PROOF });
    expect(answer).toEqual({ status: 409, body: { ok: false, code: "email_taken", error: "That email already has an account." } });
  });

  it("on service, lets an administrator invite a member, and refuses a member by policy", async () => {
    const harness = await createAccountsHarness();
    const allowed = await inviteMember(await harness.deps(harness.admin, "service"), { email: "m@example.test", displayName: "M", role: "member", proof: PROOF });
    expect(allowed.status).toBe(200);
    const member = await harness.addPerson("worker@example.test", "FluxIQUserAccess");
    const denied = await inviteMember(await harness.deps(member, "service"), { email: "n@example.test", displayName: "N", role: "administrator", proof: PROOF });
    expect(denied).toMatchObject({ status: 403, body: { code: "forbidden" } });
  });
});

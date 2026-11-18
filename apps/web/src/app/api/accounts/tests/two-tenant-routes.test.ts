import type { PlatformAccountRecord } from "fluxiq/platform";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/headers", async () => (await import("./two-tenant-runtime")).nextHeadersMock());
vi.mock("../../../../lib/fluxiq", async () => (await import("./two-tenant-runtime")).fluxiqModuleMock());
vi.mock("../../../../server/provisioning-listener", async () => (await import("./two-tenant-runtime")).provisioningListenerMock());
vi.mock("../../../../server/browser-trust", () => ({ resolveServiceClientHttpRoute: async () => null }));

import { DUMMY_PASSWORD } from "../server/tests/accounts-harness";
import { GET as readAudit } from "../../security/audit/route";
import { POST as invite } from "../invite/route";
import { POST as changeMember } from "../member/route";
import { GET as readMembers } from "../members/route";
import { asPerson, outstandingLeases, resetTwoTenants, TENANT_A, TENANT_B, twoTenants, type Person } from "./two-tenant-runtime";

// The accounts and activity routes on the hosted `service` profile, with two
// tenant workspaces: every call acts in, and is decided by, the workspace the
// caller's session works in, never one the request names and never the
// primary instance; a turned-off or deleted account's session reaches
// nothing; and the caller's workspace is released on every path.

const ORIGIN = "https://panel.example.test";
const PROOF = { password: DUMMY_PASSWORD };

beforeEach(async () => {
  await resetTwoTenants();
});

afterEach(() => {
  expect(twoTenants.primaryApi.authorize).not.toHaveBeenCalled();
  expect(outstandingLeases()).toBe(0);
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

function inviteAs(who: Person | null, body: Record<string, unknown>) {
  return invite(asPerson(who, `${ORIGIN}/api/accounts/invite`, body));
}

function changeAs(who: Person | null, body: Record<string, unknown>) {
  return changeMember(asPerson(who, `${ORIGIN}/api/accounts/member`, body));
}

async function membershipOf(workspaceId: string, userId: string) {
  return twoTenants.services.store.getMembership(workspaceId, userId);
}

async function accountStatus(userId: string) {
  return (await twoTenants.services.store.getAccount(userId))?.status;
}

describe("accounts writes, two tenants", () => {
  it("invites into the caller's own workspace, decided by its policies, whatever workspace the body names", async () => {
    const { adminA } = twoTenants.people;
    const response = await inviteAs(adminA, { email: "new@example.test", displayName: "New", role: "read-only", proof: PROOF, workspace: TENANT_B, workspaceId: TENANT_B });
    expect(response.status).toBe(200);
    const { payload } = await response.json() as { payload: { userId: string } };
    expect(await membershipOf(TENANT_A, payload.userId)).toMatchObject({ status: "active", policies: ["FluxIQReadOnlyAccess"] });
    expect(await membershipOf(TENANT_B, payload.userId)).toBeNull();
    expect(twoTenants.acquired).toEqual([TENANT_A]);
    expect(twoTenants.decisions.records.some((record) => record.action === "iam:InviteMember" && record.decision === "allow" && record.principal.includes(`:${TENANT_A}:`))).toBe(true);
  });

  it("refuses a person who administers another workspace by the policies of the one their session works in", async () => {
    // `shared` is an administrator of B, but works in A (their first membership), where they are a member.
    const { shared } = twoTenants.people;
    const response = await inviteAs(shared, { email: "nope@example.test", displayName: "Nope", role: "administrator", proof: PROOF, workspace: TENANT_B });
    expect(response.status).toBe(403);
    expect(await twoTenants.services.store.findAccountByEmail("nope@example.test")).toBeNull();
    expect(twoTenants.acquired).toEqual([TENANT_A]);
  });

  it("never reaches a person of another workspace, by any change", async () => {
    const { adminB, memberA } = twoTenants.people;
    for (const action of ["set-role", "turn-off", "turn-on", "remove", "resend-invite", "revoke-invite"]) {
      const response = await changeAs(adminB, { action, userId: memberA.userId, role: "administrator", proof: PROOF, workspaceId: TENANT_A });
      expect([action, response.status]).toEqual([action, 404]);
    }
    expect(await membershipOf(TENANT_A, memberA.userId)).toMatchObject({ status: "active", policies: ["FluxIQUserAccess"] });
    expect(await accountStatus(memberA.userId)).toBe("active");
    expect(new Set(twoTenants.acquired)).toEqual(new Set([TENANT_B]));
  });

  it("changes a shared person's role only in the caller's workspace", async () => {
    const { adminA, shared } = twoTenants.people;
    const response = await changeAs(adminA, { action: "set-role", userId: shared.userId, role: "read-only", proof: PROOF });
    expect(response.status).toBe(200);
    expect(await membershipOf(TENANT_A, shared.userId)).toMatchObject({ policies: ["FluxIQReadOnlyAccess"] });
    expect(await membershipOf(TENANT_B, shared.userId)).toMatchObject({ status: "active", policies: ["FluxIQAdministratorAccess"] });
  });

  it("refuses a change to the account of a person who is also in another workspace", async () => {
    const { adminA, shared } = twoTenants.people;
    const before = await twoTenants.identity.validateSession(shared.sessionId);
    for (const action of ["turn-off", "turn-on", "revoke-invite", "resend-invite"]) {
      const response = await changeAs(adminA, { action, userId: shared.userId, proof: PROOF });
      expect([action, response.status, (await response.json() as { code: string }).code]).toEqual([action, 409, "shared_account"]);
    }
    expect(await accountStatus(shared.userId)).toBe("active");
    expect(before).not.toBeNull();
    expect(await twoTenants.identity.validateSession(shared.sessionId)).not.toBeNull();
  });

  it("turns off a person of the caller's workspace alone, and their session then reaches nothing", async () => {
    const { adminA, memberA } = twoTenants.people;
    const off = await changeAs(adminA, { action: "turn-off", userId: memberA.userId, proof: PROOF });
    expect(off.status).toBe(200);
    expect(await accountStatus(memberA.userId)).toBe("disabled");
    twoTenants.acquired = [];
    expect((await inviteAs(memberA, { email: "x@example.test", displayName: "X", role: "read-only", proof: PROOF })).status).toBe(401);
    expect((await readMembers(asPerson(memberA, `${ORIGIN}/api/accounts/members`))).status).toBe(401);
    expect(twoTenants.acquired).toEqual([]);
  });

  it.each<[string, Partial<PlatformAccountRecord>]>([
    ["disabled", { status: "disabled" }],
    ["deleted", { status: "deleted" }],
    ["pending deletion", { deletion: { receiptId: "fixture-receipt", requestedAtMs: 1, scheduledForMs: 2 } }]
  ])("refuses a %s account whose session is still live, before holding any workspace", async (_label, fields) => {
    const { adminA } = twoTenants.people;
    const account = await twoTenants.services.store.getAccount(adminA.userId);
    if (account === null) throw new Error("fixture account is missing");
    await twoTenants.services.store.putAccount({ ...account, ...fields });
    expect(await twoTenants.identity.validateSession(adminA.sessionId)).not.toBeNull();
    expect((await inviteAs(adminA, { email: "x@example.test", displayName: "X", role: "read-only", proof: PROOF })).status).toBe(401);
    expect((await changeAs(adminA, { action: "set-role", userId: twoTenants.people.memberA.userId, role: "read-only", proof: PROOF })).status).toBe(401);
    expect(twoTenants.acquired).toEqual([]);
    expect(await membershipOf(TENANT_A, twoTenants.people.memberA.userId)).toMatchObject({ policies: ["FluxIQUserAccess"] });
  });

  it("refuses a forged or missing session, before holding any workspace", async () => {
    expect((await inviteAs(null, { email: "x@example.test", displayName: "X", role: "read-only" })).status).toBe(401);
    expect((await changeAs({ userId: twoTenants.people.adminA.userId, sessionId: "forged-session" }, { action: "turn-off", userId: twoTenants.people.memberB.userId, proof: PROOF })).status).toBe(401);
    expect(twoTenants.acquired).toEqual([]);
    expect(await accountStatus(twoTenants.people.memberB.userId)).toBe("active");
  });
});

describe("the caller's workspace is released on every path", () => {
  it("after a refusal by policy, a malformed body, an unknown change and a failed re-proof", async () => {
    const { adminA, memberA } = twoTenants.people;
    expect((await inviteAs(memberA, { email: "x@example.test", displayName: "X", role: "read-only", proof: PROOF })).status).toBe(403);
    expect(outstandingLeases()).toBe(0);
    twoTenants.cookie = adminA.sessionId;
    const malformed = await changeMember(new Request(`${ORIGIN}/api/accounts/member`, { method: "POST", headers: { "content-type": "application/json" }, body: "{not json" }));
    expect(malformed.status).toBe(400);
    expect(outstandingLeases()).toBe(0);
    expect((await changeAs(adminA, { action: "promote-to-god", userId: memberA.userId })).status).toBe(400);
    expect(outstandingLeases()).toBe(0);
    expect((await changeAs(adminA, { action: "set-role", userId: memberA.userId, role: "read-only", proof: { password: "not the password" } })).status).toBe(403);
    expect(twoTenants.acquired).toEqual([TENANT_A, TENANT_A, TENANT_A, TENANT_A]);
    expect(await membershipOf(TENANT_A, memberA.userId)).toMatchObject({ policies: ["FluxIQUserAccess"] });
  });

  it("when provisioning throws", async () => {
    const { adminA, memberA } = twoTenants.people;
    vi.spyOn(twoTenants.services.provisioning, "run").mockRejectedValue(new Error("synthetic provisioning failure"));
    await expect(changeAs(adminA, { action: "set-role", userId: memberA.userId, role: "read-only", proof: PROOF })).rejects.toThrow("synthetic provisioning failure");
    expect(twoTenants.acquired).toEqual([TENANT_A]);
  });

  it("when the platform store throws", async () => {
    const { adminA, memberA } = twoTenants.people;
    vi.spyOn(twoTenants.services.store, "getMembership").mockRejectedValue(new Error("synthetic store failure"));
    await expect(changeAs(adminA, { action: "turn-off", userId: memberA.userId, proof: PROOF })).rejects.toThrow("synthetic store failure");
    expect(twoTenants.acquired).toEqual([TENANT_A]);
  });
});

describe("accounts and activity reads, two tenants", () => {
  it("lists only the caller's workspace's people, whatever workspace the URL names", async () => {
    const { adminA, adminB, memberB } = twoTenants.people;
    const response = await readMembers(asPerson(adminA, `${ORIGIN}/api/accounts/members?workspace=${TENANT_B}&workspaceId=${TENANT_B}`));
    expect(response.status).toBe(200);
    const text = await response.text();
    expect(text).not.toContain(adminB.userId);
    expect(text).not.toContain(memberB.userId);
    expect(text).not.toContain("admin-b@example.test");
    const listed = (JSON.parse(text) as { payload: { members: { userId: string }[] } }).payload.members.map((row) => row.userId).sort();
    expect(listed).toEqual([adminA.userId, twoTenants.people.memberA.userId, twoTenants.people.shared.userId].sort());
  });

  it("shows a workspace's activity without the other workspace's", async () => {
    const { adminA, adminB, memberA } = twoTenants.people;
    expect((await changeAs(adminB, { action: "set-role", userId: twoTenants.people.memberB.userId, role: "read-only", proof: PROOF })).status).toBe(200);
    expect((await changeAs(adminA, { action: "set-role", userId: memberA.userId, role: "read-only", proof: PROOF })).status).toBe(200);
    const response = await readAudit(asPerson(adminA, `${ORIGIN}/api/security/audit?workspace=${TENANT_B}`));
    expect(response.status).toBe(200);
    const text = await response.text();
    expect(text).not.toContain(adminB.userId);
    expect(text).not.toContain(twoTenants.people.memberB.userId);
    expect(text).not.toContain(TENANT_B);
    expect((JSON.parse(text) as { payload: { entries: unknown[] } }).payload.entries.length).toBeGreaterThan(0);
  });

  it("refuses a member the people list and the activity by their own workspace's policies", async () => {
    const { shared } = twoTenants.people;
    expect((await readMembers(asPerson(shared, `${ORIGIN}/api/accounts/members`))).status).toBe(403);
    expect((await readAudit(asPerson(shared, `${ORIGIN}/api/security/audit`))).status).toBe(403);
  });
});

// An account holder's sign-in name, role and on/off belong to provisioning:
// their sign-in name is their account email, their role is derived from their
// workspace memberships' policies, and their on/off from their account's
// status. With the real identity-access service, its real `update-user` and
// `snapshot` endpoints and the real provisioning service, `update-user` refuses
// to change any of the three for an account holder, by name and before any
// credential is spent, so the role and the policies never disagree; their
// display name still changes; a person without an account keeps changing
// through it; an owner that cannot answer refuses the change rather than
// letting it through; and the snapshot marks each person exactly as
// `update-user` decides, so a client never offers a refused change. A value
// equal to the stored one is not a change: resending it is neither refused,
// nor asked for proof, nor written, for anyone. Dummy values only; scrypt at
// N=2^10.

import { describe, expect, it, vi } from "vitest";
import { MemoryIamAuditSink } from "../../../../platform/iam/index.ts";
import { MemoryEmailSender } from "../../../../platform/provisioning/email/index.ts";
import { createPlatformServices } from "../../../../platform/provisioning/service/index.ts";
import { MemoryRecordRepository } from "../../../../platform/provisioning/tests/memory-record-repository.ts";
import { GlobalProgramApiRegistry, type ProgramApiActor } from "../../../_shared/api.ts";
import { IdentityAuthorityManagedError, IdentityAuthorityUncheckedError } from "../../runtime/authority/index.ts";
import { IdentityAccessService } from "../../runtime/service.ts";
import type { IdentityAuthorityOwner } from "../../types.ts";
import type { IdentityAccessSnapshotResponse } from "../contracts.ts";
import { registerIdentityAccessApi } from "../handlers.ts";

const WEAK_KDF = { testOnlyWeakParameters: { N: 2 ** 10, r: 8, p: 1, keyLength: 32 } as const };
const PASSWORD = "dummy-password";
const CALLER = "caller.admin";
const OLDER_PERSON = "older.viewer";
const WORKSPACE = "workspace-main";

async function setup() {
  const repository = new MemoryRecordRepository();
  const identity = new IdentityAccessService({ passwordKdf: WEAK_KDF });
  const services = await createPlatformServices({
    repository,
    iamRepository: repository,
    identity,
    email: new MemoryEmailSender(),
    auditSink: new MemoryIamAuditSink(),
    publicOrigin: "https://app.example.test/",
    tenancy: { mode: "single", workspaceId: WORKSPACE }
  });
  await identity.upsertUser({ id: CALLER, username: "caller-admin", displayName: "Caller Admin", roleId: "admin", password: PASSWORD });
  await identity.upsertUser({ id: OLDER_PERSON, username: "older-viewer", displayName: "Older Viewer", roleId: "viewer", password: PASSWORD });
  const http = services.provisionerCaller("10.1.2.3");
  const created = await services.provisioning.run("createAccount", { requestId: "c1", email: "holder@example.test", displayName: "Account Holder", policies: ["FluxIQReadOnlyAccess"], workspace: "new" }, http);
  if (!created.ok || created.result.status !== "created") throw new Error("expected created");
  const holder = created.result.userId;
  const owner: IdentityAuthorityOwner = { holdsAuthorityOf: async (userId) => (await services.store.getAccount(userId)) !== null };
  identity.authority.holdElsewhere(owner);
  const registry = new GlobalProgramApiRegistry();
  registerIdentityAccessApi(registry, identity);
  const login = await identity.authenticate({ username: "caller-admin", password: PASSWORD });
  const actor: ProgramApiActor = { sessionId: login.session.id, userId: login.user.id, roleId: login.role.id, permissions: login.role.permissions };
  const proof = { authSessionId: login.session.id, authorizationPassword: PASSWORD };
  const updateUser = (payload: Record<string, unknown>) => registry.call({ programId: "identity-access", endpoint: "update-user", scope: {}, actor, payload });
  const state = async (userId: string) => ({
    user: (await identity.snapshot()).users.find((user) => user.id === userId),
    membership: await services.store.getMembership(WORKSPACE, userId),
    account: await services.store.getAccount(userId)
  });
  const listed = async () => {
    const answer = await registry.call({ programId: "identity-access", endpoint: "snapshot", scope: {}, actor, payload: {} });
    if (!answer.ok) throw new Error("expected a snapshot");
    return (answer.payload as IdentityAccessSnapshotResponse).users;
  };
  return { identity, services, http, holder, owner, updateUser, proof, state, listed };
}

describe("update-user for a person with an account", () => {
  it("refuses a role change by name, saying to use provisioning, and changes neither the role nor the policies", async () => {
    const { holder, updateUser, proof, state } = await setup();

    const answer = await updateUser({ id: holder, roleId: "admin", ...proof });

    expect(answer).toMatchObject({ ok: false, errorCode: IdentityAuthorityManagedError.code });
    expect(answer.error).toContain("provisioning");
    expect(answer.error).toContain("setPolicies");
    const after = await state(holder);
    expect(after.user?.roleId).toBe("viewer");
    expect(after.membership?.policies).toEqual(["FluxIQReadOnlyAccess"]);
  });

  it("refuses before any credential is checked, so a missing proof is not what the caller is told", async () => {
    const { holder, updateUser } = await setup();

    const answer = await updateUser({ id: holder, roleId: "admin" });

    expect(answer).toMatchObject({ ok: false, errorCode: IdentityAuthorityManagedError.code });
    expect(answer).not.toHaveProperty("requiresRecheck");
  });

  it("refuses turning sign-in off or on, so the account's status and the sign-in never disagree", async () => {
    const { holder, updateUser, proof, state } = await setup();

    expect(await updateUser({ id: holder, enabled: false, ...proof })).toMatchObject({ ok: false, errorCode: IdentityAuthorityManagedError.code });
    expect((await state(holder)).user?.enabled).toBe(true);
    expect((await state(holder)).account?.status).toBe("active");
  });

  it("still renames an account holder, which moves no authority", async () => {
    const { holder, updateUser, state } = await setup();

    expect(await updateUser({ id: holder, displayName: "Renamed Holder" })).toMatchObject({ ok: true });
    expect((await state(holder)).user?.displayName).toBe("Renamed Holder");
  });

  it("refuses changing their sign-in name away from their account email, by name, and keeps it", async () => {
    const { holder, updateUser, state } = await setup();

    const answer = await updateUser({ id: holder, username: "someone-else" });

    expect(answer).toMatchObject({ ok: false, errorCode: IdentityAuthorityManagedError.code });
    expect(answer.error).toContain("account email");
    const after = await state(holder);
    expect(after.user?.username).toBe(after.account?.email);
    expect(after.user?.username).toBe("holder@example.test");
  });

  it("refuses a sign-in name sent with a display name as a whole, so neither changes", async () => {
    const { holder, updateUser, state } = await setup();

    expect(await updateUser({ id: holder, username: "someone-else", displayName: "Renamed Holder" })).toMatchObject({ ok: false, errorCode: IdentityAuthorityManagedError.code });
    expect((await state(holder)).user).toMatchObject({ username: "holder@example.test", displayName: "Account Holder" });
  });

  it("leaves provisioning as the one writer: its role change moves the policies and the sign-in role together", async () => {
    const { services, http, holder, state } = await setup();

    const changed = await services.provisioning.run("setPolicies", { requestId: "sp1", userId: holder, workspaceId: WORKSPACE, policies: ["FluxIQAdministratorAccess"] }, http);

    expect(changed.ok).toBe(true);
    const after = await state(holder);
    expect(after.membership?.policies).toEqual(["FluxIQAdministratorAccess"]);
    expect(after.user?.roleId).toBe("admin");
  });
});

describe("update-user for a person without an account", () => {
  it("still changes their role and sign-in through Identity Access, with the proof", async () => {
    const { updateUser, proof, state } = await setup();

    expect(await updateUser({ id: OLDER_PERSON, roleId: "admin", ...proof })).toMatchObject({ ok: true, payload: { roleId: "admin" } });
    expect(await updateUser({ id: OLDER_PERSON, enabled: false, ...proof })).toMatchObject({ ok: true, payload: { enabled: false } });
    expect((await state(OLDER_PERSON)).user).toMatchObject({ roleId: "admin", enabled: false });
  });

  it("still changes their sign-in name, which needs no proof", async () => {
    const { updateUser, state } = await setup();

    expect(await updateUser({ id: OLDER_PERSON, username: "renamed-viewer" })).toMatchObject({ ok: true, payload: { username: "renamed-viewer" } });
    expect((await state(OLDER_PERSON)).user?.username).toBe("renamed-viewer");
  });

  it("still asks for the proof", async () => {
    const { updateUser } = await setup();

    expect(await updateUser({ id: OLDER_PERSON, roleId: "admin" })).toMatchObject({ ok: false, requiresRecheck: true });
  });
});

describe("update-user with values equal to the stored ones", () => {
  it("lets an account holder resend their unchanged sign-in name with a display-name edit, and changes only the display name", async () => {
    const { holder, updateUser, state } = await setup();
    const before = await state(holder);

    const answer = await updateUser({ id: holder, username: "holder@example.test", displayName: "Renamed Holder" });

    expect(answer).toMatchObject({ ok: true, payload: { username: "holder@example.test", displayName: "Renamed Holder" } });
    const after = await state(holder);
    expect(after.user).toMatchObject({ username: "holder@example.test", displayName: "Renamed Holder", roleId: before.user?.roleId, enabled: before.user?.enabled });
    expect(after.user?.username).toBe(after.account?.email);
    expect(after.membership?.policies).toEqual(before.membership?.policies);
    expect(after.account?.status).toBe("active");
  });

  it("still refuses an account holder's real sign-in name change by name, even beside an unchanged role", async () => {
    const { holder, updateUser, state } = await setup();

    const answer = await updateUser({ id: holder, username: "Holder@example.test", roleId: "viewer", displayName: "Renamed Holder" });

    expect(answer).toMatchObject({ ok: false, errorCode: IdentityAuthorityManagedError.code });
    expect((await state(holder)).user).toMatchObject({ username: "holder@example.test", displayName: "Account Holder" });
  });

  it("lets an account holder resend their unchanged role and on/off, with no proof, and still refuses a real one", async () => {
    const { holder, updateUser, state } = await setup();

    const resent = await updateUser({ id: holder, roleId: "viewer", enabled: true, displayName: "Renamed Holder" });

    expect(resent).toMatchObject({ ok: true, payload: { roleId: "viewer", enabled: true, displayName: "Renamed Holder" } });
    expect(resent).not.toHaveProperty("requiresRecheck");
    expect(await updateUser({ id: holder, roleId: "viewer", enabled: false })).toMatchObject({ ok: false, errorCode: IdentityAuthorityManagedError.code });
    expect(await updateUser({ id: holder, roleId: "admin", enabled: true })).toMatchObject({ ok: false, errorCode: IdentityAuthorityManagedError.code });
    expect((await state(holder)).user).toMatchObject({ roleId: "viewer", enabled: true });
  });

  it("asks a person without an account for no proof for unchanged values, and writes none of them", async () => {
    const { identity, updateUser, state } = await setup();
    const update = vi.spyOn(identity, "updateUser");

    const answer = await updateUser({ id: OLDER_PERSON, username: "older-viewer", roleId: "viewer", enabled: true, displayName: "Renamed Viewer" });

    expect(answer).toMatchObject({ ok: true, payload: { username: "older-viewer", roleId: "viewer", enabled: true, displayName: "Renamed Viewer" } });
    expect(answer).not.toHaveProperty("requiresRecheck");
    expect(update).toHaveBeenCalledTimes(1);
    const written = update.mock.calls[0]?.[0];
    expect(written).toMatchObject({ id: OLDER_PERSON, displayName: "Renamed Viewer" });
    expect(written).not.toHaveProperty("username");
    expect(written).not.toHaveProperty("roleId");
    expect(written).not.toHaveProperty("enabled");
    expect((await state(OLDER_PERSON)).user).toMatchObject({ username: "older-viewer", roleId: "viewer", enabled: true, displayName: "Renamed Viewer" });
  });

  it("still asks a person without an account for proof of a real role change sent beside unchanged values", async () => {
    const { updateUser, proof, state } = await setup();

    expect(await updateUser({ id: OLDER_PERSON, username: "older-viewer", enabled: true, roleId: "admin" })).toMatchObject({ ok: false, requiresRecheck: true });
    expect((await state(OLDER_PERSON)).user?.roleId).toBe("viewer");
    expect(await updateUser({ id: OLDER_PERSON, username: "older-viewer", enabled: true, roleId: "admin", ...proof })).toMatchObject({ ok: true, payload: { roleId: "admin" } });
  });

  it("fails a request for an unknown person as before: proof first for a role change, then not found", async () => {
    const { updateUser, proof } = await setup();

    const renamed = await updateUser({ id: "no.such.person", displayName: "Nobody" });
    expect(renamed).toMatchObject({ ok: false });
    expect(renamed.error).toContain("Unknown user");
    expect(await updateUser({ id: "no.such.person", roleId: "viewer" })).toMatchObject({ ok: false, requiresRecheck: true });
    const reproved = await updateUser({ id: "no.such.person", roleId: "viewer", ...proof });
    expect(reproved).toMatchObject({ ok: false });
    expect(reproved.error).toContain("Unknown user");
  });
});

describe("the authority owner", () => {
  it("refuses the change by name when it cannot answer, and changes nothing", async () => {
    const identity = new IdentityAccessService({ passwordKdf: WEAK_KDF });
    await identity.upsertUser({ id: CALLER, username: "caller-admin", displayName: "Caller Admin", roleId: "admin", password: PASSWORD });
    await identity.upsertUser({ id: OLDER_PERSON, username: "older-viewer", displayName: "Older Viewer", roleId: "viewer", password: PASSWORD });
    identity.authority.holdElsewhere({ holdsAuthorityOf: async () => { throw new Error("store unreadable"); } });
    const registry = new GlobalProgramApiRegistry();
    registerIdentityAccessApi(registry, identity);
    const login = await identity.authenticate({ username: "caller-admin", password: PASSWORD });
    const actor: ProgramApiActor = { sessionId: login.session.id, userId: login.user.id, roleId: login.role.id, permissions: login.role.permissions };

    const answer = await registry.call({ programId: "identity-access", endpoint: "update-user", scope: {}, actor, payload: { id: OLDER_PERSON, roleId: "admin", authSessionId: login.session.id, authorizationPassword: PASSWORD } });

    expect(answer).toMatchObject({ ok: false, errorCode: IdentityAuthorityUncheckedError.code });
    expect(answer.error).not.toContain("store unreadable");
    expect((await identity.snapshot()).users.find((user) => user.id === OLDER_PERSON)?.roleId).toBe("viewer");
  });

  it("is set once: the same owner again is a no-op, and another is refused", async () => {
    const { identity, owner } = await setup();

    expect(() => identity.authority.holdElsewhere(owner)).not.toThrow();
    expect(() => identity.authority.holdElsewhere({ holdsAuthorityOf: async () => false })).toThrow(/already held elsewhere/u);
  });
});

describe("the snapshot endpoint", () => {
  it("marks an account holder as held elsewhere and everyone else as held here", async () => {
    const { holder, listed } = await setup();

    const users = await listed();

    expect(users.find((user) => user.id === holder)?.authorityHeldElsewhere).toBe(true);
    expect(users.find((user) => user.id === OLDER_PERSON)?.authorityHeldElsewhere).toBe(false);
    expect(users.find((user) => user.id === CALLER)?.authorityHeldElsewhere).toBe(false);
  });

  it("marks each person exactly as update-user decides a real change of theirs", async () => {
    const { listed, updateUser } = await setup();

    for (const user of await listed()) {
      const answer = await updateUser({ id: user.id, enabled: !user.enabled });
      expect(answer.errorCode === IdentityAuthorityManagedError.code).toBe(user.authorityHeldElsewhere);
    }
  });

  it("speaks only of real changes: resending anyone's current values is refused for nobody, marked or not", async () => {
    const { listed, updateUser } = await setup();

    for (const user of await listed()) {
      const answer = await updateUser({ id: user.id, username: user.username, roleId: user.roleId, enabled: user.enabled });
      expect(answer).toMatchObject({ ok: true });
    }
  });

  it("marks everyone as held elsewhere when the owner cannot answer, as update-user refuses them all", async () => {
    const identity = new IdentityAccessService({ passwordKdf: WEAK_KDF });
    await identity.upsertUser({ id: OLDER_PERSON, username: "older-viewer", displayName: "Older Viewer", roleId: "viewer" });
    identity.authority.holdElsewhere({ holdsAuthorityOf: async () => { throw new Error("store unreadable"); } });

    const listing = await identity.authority.listing(await identity.snapshot());

    expect(listing.users.map((user) => user.id)).toContain(OLDER_PERSON);
    expect(listing.users.every((user) => user.authorityHeldElsewhere)).toBe(true);
  });

  it("marks nobody when no owner is set, as a Core host without provisioning decides everything here", async () => {
    const identity = new IdentityAccessService({ passwordKdf: WEAK_KDF });
    await identity.upsertUser({ id: OLDER_PERSON, username: "older-viewer", displayName: "Older Viewer", roleId: "viewer" });
    const registry = new GlobalProgramApiRegistry();
    registerIdentityAccessApi(registry, identity);

    const answer = await registry.call({ programId: "identity-access", endpoint: "snapshot", scope: {}, actor: { sessionId: "s", userId: OLDER_PERSON, roleId: "admin", permissions: ["programs.read"] }, payload: {} });

    expect(answer.ok).toBe(true);
    const users = (answer.payload as IdentityAccessSnapshotResponse).users;
    expect(users.map((user) => user.id)).toContain(OLDER_PERSON);
    expect(users.some((user) => user.authorityHeldElsewhere)).toBe(false);
  });
});

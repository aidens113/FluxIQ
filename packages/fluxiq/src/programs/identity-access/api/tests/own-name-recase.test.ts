// Anyone may re-case their own sign-in name through `update-user`: a name that
// equals the stored one ignoring case, sent by the person themselves, is the
// same name of the same person. It is written as sent, it is not a change of
// authority (never refused as held elsewhere, and the owner is not even asked)
// and it asks no proof; the person keeps their id, sessions, memberships and
// account, and sign-in, which folds case, finds them by either case. That holds
// for an account holder (their sign-in name is their account email, the same
// address in any case; the account's stored email stays as provisioning keeps
// it) and for a person without an account. A real rename is still refused for
// an account holder, and a name another person has in any case is still
// refused by name. Re-casing someone else's name is covered in
// authority-held-elsewhere.test.ts and username-case.test.ts. With the real
// identity-access service, its real endpoints and the real provisioning
// service. Dummy values only; scrypt at N=2^10.

import { describe, expect, it, vi } from "vitest";
import { MemoryIamAuditSink } from "../../../../platform/iam/index.ts";
import { MemoryEmailSender } from "../../../../platform/provisioning/email/index.ts";
import { createPlatformServices } from "../../../../platform/provisioning/service/index.ts";
import { MemoryRecordRepository } from "../../../../platform/provisioning/tests/memory-record-repository.ts";
import { GlobalProgramApiRegistry, type ProgramApiActor } from "../../../_shared/api.ts";
import { IdentityAuthorityManagedError } from "../../runtime/authority/index.ts";
import { IdentityAccessService } from "../../runtime/service.ts";
import { IdentityUsernameTakenError } from "../../runtime/username-taken-error.ts";
import type { IdentityAuthorityOwner } from "../../types.ts";
import type { IdentityAccessSnapshotResponse } from "../contracts.ts";
import { registerIdentityAccessApi } from "../handlers.ts";

const WEAK_KDF = { testOnlyWeakParameters: { N: 2 ** 10, r: 8, p: 1, keyLength: 32 } as const };
const PASSWORD = "dummy-password";
const CALLER = "caller.admin";
const OLDER_PERSON = "older.viewer";
const WORKSPACE = "workspace-main";

/** `update-user` and `snapshot` called by the person who signs in as `username`, on their own session. */
async function signedInAs(identity: IdentityAccessService, registry: GlobalProgramApiRegistry, username: string) {
  const login = await identity.authenticate({ username, password: PASSWORD });
  const actor: ProgramApiActor = { sessionId: login.session.id, userId: login.user.id, roleId: login.role.id, permissions: login.role.permissions };
  const updateOwn = (payload: Record<string, unknown>) => registry.call({ programId: "identity-access", endpoint: "update-user", scope: {}, actor, payload });
  const listed = async () => {
    const answer = await registry.call({ programId: "identity-access", endpoint: "snapshot", scope: {}, actor, payload: {} });
    if (!answer.ok) throw new Error("expected a snapshot");
    return (answer.payload as IdentityAccessSnapshotResponse).users;
  };
  return { session: login.session, updateOwn, listed };
}

/**
 * An identity service whose account holders' authority is held by the real
 * provisioning, with an administrator and a viewer who have no account and one
 * account holder (`holder@example.test`). Provisioning makes the holder an
 * administrator (`setPolicies`, the one writer of their role), so they may call
 * `update-user`, and they are given a password to sign in with.
 */
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
  const promoted = await services.provisioning.run("setPolicies", { requestId: "sp1", userId: holder, workspaceId: WORKSPACE, policies: ["FluxIQAdministratorAccess"] }, http);
  if (!promoted.ok) throw new Error("expected the holder promoted");
  await identity.setPassword(holder, PASSWORD);
  const registry = new GlobalProgramApiRegistry();
  registerIdentityAccessApi(registry, identity);
  const state = async (userId: string) => ({
    user: (await identity.snapshot()).users.find((user) => user.id === userId),
    membership: await services.store.getMembership(WORKSPACE, userId),
    account: await services.store.getAccount(userId)
  });
  return { identity, registry, holder, owner, state };
}

describe("an account holder re-casing their own sign-in name", () => {
  it("is saved as sent, as the same person, with nothing else changed, the owner not asked and no proof", async () => {
    const { identity, registry, holder, owner, state } = await setup();
    const { session, updateOwn, listed } = await signedInAs(identity, registry, "holder@example.test");
    const before = await state(holder);
    const asked = vi.spyOn(owner, "holdsAuthorityOf");

    const answer = await updateOwn({ id: holder, username: "Holder@Example.Test" });

    expect(answer).toMatchObject({ ok: true, payload: { id: holder, username: "Holder@Example.Test" } });
    expect(answer).not.toHaveProperty("requiresRecheck");
    expect(asked).not.toHaveBeenCalled();
    const after = await state(holder);
    expect(after.user).toEqual({ ...before.user, username: "Holder@Example.Test", updatedAtMs: after.user?.updatedAtMs });
    expect(after.membership).toEqual(before.membership);
    expect(after.account).toEqual(before.account);
    expect(after.account?.email).toBe("holder@example.test");
    // The session they signed in with is still theirs.
    expect((await identity.validateSession(session.id))?.user.id).toBe(holder);
    // Sign-in folds case, so it finds them by either.
    for (const username of ["holder@example.test", "HOLDER@EXAMPLE.TEST", "Holder@Example.Test"]) {
      expect((await identity.authenticate({ username, password: PASSWORD })).user.id).toBe(holder);
    }
    // A real change of their name, role or on/off is still provisioning's, and the snapshot still says so.
    expect((await listed()).find((user) => user.id === holder)?.authorityHeldElsewhere).toBe(true);
  });

  it("still refuses a real rename of their own sign-in name, by name, and writes nothing", async () => {
    const { identity, registry, holder, state } = await setup();
    const { updateOwn } = await signedInAs(identity, registry, "holder@example.test");
    const update = vi.spyOn(identity, "updateUser");

    const answer = await updateOwn({ id: holder, username: "someone.else@example.test", displayName: "Renamed Holder" });

    expect(answer).toMatchObject({ ok: false, errorCode: IdentityAuthorityManagedError.code });
    expect(update).not.toHaveBeenCalled();
    expect((await state(holder)).user).toMatchObject({ username: "holder@example.test", displayName: "Account Holder" });
  });

  it("still refuses their own on/off change sent beside a re-cased name, so neither is written", async () => {
    const { identity, registry, holder, state } = await setup();
    const { updateOwn } = await signedInAs(identity, registry, "holder@example.test");
    const update = vi.spyOn(identity, "updateUser");

    expect(await updateOwn({ id: holder, username: "HOLDER@example.test", enabled: false })).toMatchObject({ ok: false, errorCode: IdentityAuthorityManagedError.code });
    expect(update).not.toHaveBeenCalled();
    expect((await state(holder)).user).toMatchObject({ username: "holder@example.test", enabled: true });
  });
});

describe("a person without an account re-casing their own sign-in name", () => {
  it("is saved as sent, as the same person, with nothing else changed and no proof", async () => {
    const { identity, registry, state } = await setup();
    const { session, updateOwn, listed } = await signedInAs(identity, registry, "caller-admin");
    const before = await state(CALLER);

    const answer = await updateOwn({ id: CALLER, username: "Caller-Admin" });

    expect(answer).toMatchObject({ ok: true, payload: { id: CALLER, username: "Caller-Admin" } });
    expect(answer).not.toHaveProperty("requiresRecheck");
    const after = await state(CALLER);
    expect(after.user).toEqual({ ...before.user, username: "Caller-Admin", updatedAtMs: after.user?.updatedAtMs });
    expect(after.account).toBeNull();
    expect((await identity.validateSession(session.id))?.user.id).toBe(CALLER);
    for (const username of ["caller-admin", "CALLER-ADMIN", "Caller-Admin"]) {
      expect((await identity.authenticate({ username, password: PASSWORD })).user.id).toBe(CALLER);
    }
    expect((await listed()).find((user) => user.id === CALLER)?.authorityHeldElsewhere).toBe(false);
  });

  it("is saved even when the owner cannot answer, since it is not a change of authority", async () => {
    const identity = new IdentityAccessService({ passwordKdf: WEAK_KDF });
    await identity.upsertUser({ id: CALLER, username: "caller-admin", displayName: "Caller Admin", roleId: "admin", password: PASSWORD });
    identity.authority.holdElsewhere({ holdsAuthorityOf: async () => { throw new Error("store unreadable"); } });
    const registry = new GlobalProgramApiRegistry();
    registerIdentityAccessApi(registry, identity);
    const { updateOwn } = await signedInAs(identity, registry, "caller-admin");

    expect(await updateOwn({ id: CALLER, username: "Caller-Admin" })).toMatchObject({ ok: true, payload: { username: "Caller-Admin" } });
  });

  it("still refuses a rename onto another person's name in another case, by name, and changes nothing", async () => {
    const { identity, registry, state } = await setup();
    const { updateOwn } = await signedInAs(identity, registry, "caller-admin");

    expect(await updateOwn({ id: CALLER, username: "Older-Viewer" })).toMatchObject({ ok: false, errorCode: IdentityUsernameTakenError.code });
    expect((await state(CALLER)).user?.username).toBe("caller-admin");
  });
});

// A person's own sign-in name in another case, over the program API
// (`recase-my-username`): held as the preferences endpoints are, so a viewer
// who may not call `update-user` can still correct which letters of their own
// name are capitals. The person is always the caller; a payload naming anyone
// (the caller included) is refused by name; anything but the caller's current
// name ignoring case is refused by name before any other person's name is
// compared; a case-only clash with another person is refused as
// `identity.username_taken`; and the person stays the same person (id,
// sessions, memberships and account). `update-user` itself still needs
// `identity.manage`. With the real identity-access service, its real endpoints
// and the real provisioning service. Dummy values only; scrypt at N=2^10.

import { describe, expect, it, vi } from "vitest";
import type { JsonObject } from "../../../../core/index.ts";
import { MemoryIamAuditSink } from "../../../../platform/iam/index.ts";
import { MemoryEmailSender } from "../../../../platform/provisioning/email/index.ts";
import { createPlatformServices } from "../../../../platform/provisioning/service/index.ts";
import { MemoryRecordRepository } from "../../../../platform/provisioning/tests/memory-record-repository.ts";
import { GlobalProgramApiRegistry, type ProgramApiActor } from "../../../_shared/api.ts";
import { IdentityAccessService } from "../../runtime/service.ts";
import { identityRecord } from "../../runtime/stored-state.ts";
import { IdentityUsernameTakenError } from "../../runtime/username-taken-error.ts";
import type { IdentityAuthorityOwner } from "../../types.ts";
import { IDENTITY_RECASE_ERRORS, type IdentityAccessSnapshotResponse } from "../contracts.ts";
import { registerIdentityAccessApi } from "../handlers.ts";

const WEAK_KDF = { testOnlyWeakParameters: { N: 2 ** 10, r: 8, p: 1, keyLength: 32 } as const };
const PASSWORD = "dummy-password";
const ADMIN = "person.admin";
const VIEWER = "person.viewer";
const WORKSPACE = "workspace-main";

type Registry = GlobalProgramApiRegistry;
const recase = (registry: Registry, actor: ProgramApiActor | undefined, payload: unknown, via?: "assistant") =>
  registry.call({ programId: "identity-access", endpoint: "recase-my-username", scope: {}, ...(actor ? { actor } : {}), ...(via ? { via } : {}), payload });

async function actorOf(identity: IdentityAccessService, username: string): Promise<ProgramApiActor> {
  const login = await identity.authenticate({ username, password: PASSWORD });
  return { sessionId: login.session.id, userId: login.user.id, roleId: login.role.id, permissions: login.role.permissions };
}

/**
 * An administrator and a viewer without an account, and an account holder
 * (`holder@example.test`, a viewer under provisioning's read-only policy)
 * whose authority the real provisioning holds.
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
  await identity.upsertUser({ id: ADMIN, username: "person-admin", displayName: "Admin", roleId: "admin", password: PASSWORD });
  await identity.upsertUser({ id: VIEWER, username: "person-viewer", displayName: "Viewer", roleId: "viewer", password: PASSWORD });
  const http = services.provisionerCaller("10.1.2.3");
  const created = await services.provisioning.run("createAccount", { requestId: "c1", email: "holder@example.test", displayName: "Account Holder", policies: ["FluxIQReadOnlyAccess"], workspace: "new" }, http);
  if (!created.ok || created.result.status !== "created") throw new Error("expected created");
  const holder = created.result.userId;
  const owner: IdentityAuthorityOwner = { holdsAuthorityOf: async (userId) => (await services.store.getAccount(userId)) !== null };
  identity.authority.holdElsewhere(owner);
  await identity.setPassword(holder, PASSWORD);
  const registry = new GlobalProgramApiRegistry();
  registerIdentityAccessApi(registry, identity);
  const state = async (userId: string) => ({
    user: (await identity.snapshot()).users.find((user) => user.id === userId),
    membership: await services.store.getMembership(WORKSPACE, userId),
    account: await services.store.getAccount(userId)
  });
  const listed = async (actor: ProgramApiActor) => {
    const answer = await registry.call({ programId: "identity-access", endpoint: "snapshot", scope: {}, actor, payload: {} });
    if (!answer.ok) throw new Error("expected a snapshot");
    return (answer.payload as IdentityAccessSnapshotResponse).users;
  };
  return { identity, registry, holder, owner, state, listed, admin: await actorOf(identity, "person-admin"), viewer: await actorOf(identity, "person-viewer"), holderActor: await actorOf(identity, "holder@example.test") };
}

describe("recase-my-username for a viewer without an account", () => {
  it("saves their own name as sent, as the same person, found by sign-in in any case", async () => {
    const { identity, registry, viewer, state } = await setup();
    expect(viewer.permissions).toEqual(["programs.read"]);
    const before = await state(VIEWER);

    const answer = await recase(registry, viewer, { username: "Person-Viewer" });

    expect(answer).toMatchObject({ ok: true, payload: { id: VIEWER, username: "Person-Viewer", displayName: "Viewer", roleId: "viewer", enabled: true } });
    const after = await state(VIEWER);
    expect(after.user).toEqual({ ...before.user, username: "Person-Viewer", updatedAtMs: after.user?.updatedAtMs });
    expect((await identity.validateSession(viewer.sessionId))?.user.id).toBe(VIEWER);
    for (const username of ["person-viewer", "PERSON-VIEWER", "Person-Viewer"]) {
      expect((await identity.authenticate({ username, password: PASSWORD })).user.id).toBe(VIEWER);
    }
  });

  it("refuses a real rename by name, and writes nothing", async () => {
    const { identity, registry, viewer, state } = await setup();
    const update = vi.spyOn(identity, "updateUser");

    for (const username of ["someone-else", "person-viewer2", " person-viewer", "", 42, null]) {
      expect(await recase(registry, viewer, { username }), String(username)).toMatchObject({ ok: false, errorCode: IDENTITY_RECASE_ERRORS.notCaseOnly });
    }
    expect(await recase(registry, viewer, {})).toMatchObject({ ok: false, errorCode: IDENTITY_RECASE_ERRORS.notCaseOnly });
    expect(update).not.toHaveBeenCalled();
    expect((await state(VIEWER)).user?.username).toBe("person-viewer");
  });

  it("refuses another person's name in another case as a rename, never saying whether it is taken", async () => {
    const { identity, registry, viewer, state } = await setup();
    const update = vi.spyOn(identity, "updateUser");

    const answer = await recase(registry, viewer, { username: "PERSON-ADMIN" });

    expect(answer).toMatchObject({ ok: false, errorCode: IDENTITY_RECASE_ERRORS.notCaseOnly });
    expect(answer.error).not.toMatch(/already has|taken/iu);
    expect(update).not.toHaveBeenCalled();
    expect((await state(ADMIN)).user?.username).toBe("person-admin");
    expect((await state(VIEWER)).user?.username).toBe("person-viewer");
  });

  it("never reads a person from the payload: one naming anyone, the caller included, is refused by name", async () => {
    const { identity, registry, viewer, admin } = await setup();
    const update = vi.spyOn(identity, "updateUser");
    const named = [
      { id: ADMIN, username: "PERSON-ADMIN" },
      { userId: ADMIN, username: "Person-Viewer" },
      { id: VIEWER, username: "Person-Viewer" },
      { userId: VIEWER, username: "Person-Viewer" },
      { user: { id: ADMIN }, username: "Person-Viewer" },
      { username: "Person-Viewer", displayName: "Renamed" },
      { username: "Person-Viewer", roleId: "admin" },
      { username: "Person-Viewer", authSessionId: admin.sessionId }
    ];
    for (const payload of named) {
      expect(await recase(registry, viewer, payload), JSON.stringify(payload)).toMatchObject({ ok: false, errorCode: IDENTITY_RECASE_ERRORS.selfOnly });
    }
    for (const payload of [[VIEWER], "person.viewer", 7]) {
      expect(await recase(registry, viewer, payload)).toMatchObject({ ok: false, errorCode: IDENTITY_RECASE_ERRORS.selfOnly });
    }
    expect(update).not.toHaveBeenCalled();
    // The administrator's own call reaches only the administrator's name.
    expect(await recase(registry, admin, { username: "PERSON-VIEWER" })).toMatchObject({ ok: false, errorCode: IDENTITY_RECASE_ERRORS.notCaseOnly });
    expect(await recase(registry, admin, { username: "Person-Admin" })).toMatchObject({ ok: true, payload: { id: ADMIN, username: "Person-Admin" } });
    expect((await identity.snapshot()).users.find((user) => user.id === VIEWER)?.username).toBe("person-viewer");
  });

  it("takes the panel route's own authSessionId only when it is the caller's session", async () => {
    const { registry, viewer, state } = await setup();

    expect(await recase(registry, viewer, { username: "PERSON-viewer", authSessionId: viewer.sessionId })).toMatchObject({ ok: true, payload: { username: "PERSON-viewer" } });
    expect((await state(VIEWER)).user?.username).toBe("PERSON-viewer");
  });

  it("is never the assistant's, and needs a signed-in person", async () => {
    const { registry, viewer, state } = await setup();

    expect(await recase(registry, viewer, { username: "Person-Viewer" }, "assistant")).toMatchObject({ ok: false, errorCode: "authorization.forbidden" });
    expect(await recase(registry, undefined, { username: "Person-Viewer" })).toMatchObject({ ok: false, errorCode: "authorization.required" });
    expect((await state(VIEWER)).user?.username).toBe("person-viewer");
  });

  it("answers a paired browser exactly as the preferences endpoints do", async () => {
    const { registry, viewer, state } = await setup();
    const paired: ProgramApiActor = { ...viewer, channel: "paired-client" };

    const preferences = await registry.call({ programId: "identity-access", endpoint: "update-my-preferences", scope: {}, actor: paired, payload: { startingHumanness: 10 } });
    const answer = await recase(registry, paired, { username: "Person-Viewer" });

    expect(answer.ok).toBe(preferences.ok);
    expect(answer.errorCode).toBe(preferences.errorCode);
    expect((await state(VIEWER)).user?.username).toBe(answer.ok ? "Person-Viewer" : "person-viewer");
  });

  it("is not update-user: a viewer without identity.manage still cannot re-case anyone through it, their own name included", async () => {
    const { identity, registry, viewer, state } = await setup();
    const update = vi.spyOn(identity, "updateUser");

    for (const payload of [{ id: VIEWER, username: "Person-Viewer" }, { id: ADMIN, username: "Person-Admin" }]) {
      expect(await registry.call({ programId: "identity-access", endpoint: "update-user", scope: {}, actor: viewer, payload })).toMatchObject({ ok: false, errorCode: "authorization.forbidden" });
    }
    expect(update).not.toHaveBeenCalled();
    expect((await state(VIEWER)).user?.username).toBe("person-viewer");
    expect((await state(ADMIN)).user?.username).toBe("person-admin");
  });
});

describe("recase-my-username for an account holder", () => {
  it("saves their own name as sent, as the same person, the owner not asked, the account untouched", async () => {
    const { identity, registry, holder, holderActor, owner, state, listed } = await setup();
    expect(holderActor.permissions).toEqual(["programs.read"]);
    const before = await state(holder);
    const asked = vi.spyOn(owner, "holdsAuthorityOf");

    const answer = await recase(registry, holderActor, { username: "Holder@Example.Test" });

    expect(answer).toMatchObject({ ok: true, payload: { id: holder, username: "Holder@Example.Test" } });
    expect(asked).not.toHaveBeenCalled();
    const after = await state(holder);
    expect(after.user).toEqual({ ...before.user, username: "Holder@Example.Test", updatedAtMs: after.user?.updatedAtMs });
    expect(after.membership).toEqual(before.membership);
    expect(after.account).toEqual(before.account);
    expect((await identity.validateSession(holderActor.sessionId))?.user.id).toBe(holder);
    expect((await identity.authenticate({ username: "HOLDER@EXAMPLE.TEST", password: PASSWORD })).user.id).toBe(holder);
    // A real change of their name is still provisioning's.
    expect((await listed(holderActor)).find((user) => user.id === holder)?.authorityHeldElsewhere).toBe(true);
  });

  it("still refuses a real rename of their name, by name, and writes nothing", async () => {
    const { identity, registry, holder, holderActor, state } = await setup();
    const update = vi.spyOn(identity, "updateUser");

    expect(await recase(registry, holderActor, { username: "someone.else@example.test" })).toMatchObject({ ok: false, errorCode: IDENTITY_RECASE_ERRORS.notCaseOnly });
    expect(update).not.toHaveBeenCalled();
    expect((await state(holder)).user?.username).toBe("holder@example.test");
  });
});

describe("recase-my-username and another person with the same name ignoring case", () => {
  it("refuses a case-only clash by name, as identity.username_taken, and changes nothing", async () => {
    // Two people stored before names were unique ignoring case: "Ann" (stored
    // first, so the one sign-in finds) and "ann".
    const repository = new MemoryRecordRepository();
    const writer = new IdentityAccessService({ repository, passwordKdf: WEAK_KDF });
    await writer.upsertUser({ id: "first", username: "Ann", displayName: "First Ann", roleId: "viewer", password: PASSWORD });
    const second = await writer.upsertUser({ id: "second", username: "placeholder", displayName: "Second Ann", roleId: "viewer" });
    await repository.put(identityRecord("user:second", "user", { recordType: "user", user: { ...second, username: "ann" } as unknown as JsonObject }, Date.now()));
    const identity = new IdentityAccessService({ repository, passwordKdf: WEAK_KDF });
    const registry = new GlobalProgramApiRegistry();
    registerIdentityAccessApi(registry, identity);
    const first = await actorOf(identity, "ANN");
    expect(first.userId).toBe("first");

    for (const username of ["ann", "ANN", "aNn"]) {
      expect(await recase(registry, first, { username }), username).toMatchObject({ ok: false, errorCode: IdentityUsernameTakenError.code });
    }
    const names = Object.fromEntries((await identity.snapshot()).users.map((user) => [user.id, user.username]));
    expect(names).toMatchObject({ first: "Ann", second: "ann" });
  });
});

// A person's own preferences over the program API (`get-my-preferences`, `update-my-preferences`):
// the person is always the caller, a payload naming anyone (the caller included) is refused by
// name, a value outside 0-100 or not whole is refused by name, and nobody else's view of a person
// (the snapshot, an administrator's account edits) carries the value. Every password here is a
// dummy value, and derivations run at the test-only N=2^10.

import { describe, expect, it } from "vitest";
import { GlobalProgramApiRegistry, type ProgramApiActor } from "../../../_shared/api.ts";
import { IdentityAccessService } from "../../runtime/service.ts";
import { IDENTITY_PREFERENCES_ERRORS } from "../contracts.ts";
import { registerIdentityAccessApi } from "../handlers.ts";

const WEAK = { N: 2 ** 10, r: 8, p: 1, keyLength: 32 } as const;
const PASSWORD = "dummy-password";
const ADMIN = "person.admin";
const VIEWER = "person.viewer";

async function setup() {
  const service = new IdentityAccessService({ passwordKdf: { testOnlyWeakParameters: WEAK } });
  await service.upsertUser({ id: ADMIN, username: "person-admin", displayName: "Admin", roleId: "admin", password: PASSWORD });
  await service.upsertUser({ id: VIEWER, username: "person-viewer", displayName: "Viewer", roleId: "viewer", password: PASSWORD });
  const registry = new GlobalProgramApiRegistry();
  registerIdentityAccessApi(registry, service);
  const actorOf = async (username: string): Promise<ProgramApiActor> => {
    const login = await service.authenticate({ username, password: PASSWORD });
    return { sessionId: login.session.id, userId: login.user.id, roleId: login.role.id, permissions: login.role.permissions };
  };
  return { service, registry, admin: await actorOf("person-admin"), viewer: await actorOf("person-viewer") };
}

type Registry = GlobalProgramApiRegistry;
const get = (registry: Registry, actor: ProgramApiActor, payload: unknown = {}) => registry.call({ programId: "identity-access", endpoint: "get-my-preferences", scope: {}, actor, payload });
const update = (registry: Registry, actor: ProgramApiActor, payload: unknown) => registry.call({ programId: "identity-access", endpoint: "update-my-preferences", scope: {}, actor, payload });

describe("a person's own starting humanness", () => {
  it("reads null before it is set, then the value the person set", async () => {
    const { registry, viewer } = await setup();
    await expect(get(registry, viewer)).resolves.toEqual({ ok: true, payload: { startingHumanness: null } });
    await expect(update(registry, viewer, { startingHumanness: 40 })).resolves.toEqual({ ok: true, payload: { startingHumanness: 40 } });
    await expect(get(registry, viewer)).resolves.toEqual({ ok: true, payload: { startingHumanness: 40 } });
    await expect(update(registry, viewer, { startingHumanness: 0 })).resolves.toEqual({ ok: true, payload: { startingHumanness: 0 } });
    await expect(get(registry, viewer)).resolves.toEqual({ ok: true, payload: { startingHumanness: 0 } });
  });

  it("clears the value on null", async () => {
    const { registry, service, viewer } = await setup();
    await update(registry, viewer, { startingHumanness: 55 });
    await expect(update(registry, viewer, { startingHumanness: null })).resolves.toEqual({ ok: true, payload: { startingHumanness: null } });
    await expect(get(registry, viewer)).resolves.toEqual({ ok: true, payload: { startingHumanness: null } });
    expect((await service.validateSession(viewer.sessionId))?.user).not.toHaveProperty("startingHumanness");
  });

  it("refuses 101, 2.5, \"x\", -1 and a missing value by name, and keeps the stored value", async () => {
    const { registry, viewer } = await setup();
    await update(registry, viewer, { startingHumanness: 30 });
    for (const payload of [{ startingHumanness: 101 }, { startingHumanness: 2.5 }, { startingHumanness: "x" }, { startingHumanness: -1 }, { startingHumanness: Number.NaN }, {}]) {
      await expect(update(registry, viewer, payload)).resolves.toMatchObject({ ok: false, errorCode: IDENTITY_PREFERENCES_ERRORS.startingHumannessInvalid });
    }
    await expect(get(registry, viewer)).resolves.toEqual({ ok: true, payload: { startingHumanness: 30 } });
  });

  it("refuses a payload naming any person, the caller's own id included, by name", async () => {
    const { registry, viewer, admin } = await setup();
    const named = [
      { userId: ADMIN, startingHumanness: 10 },
      { userId: VIEWER, startingHumanness: 10 },
      { id: VIEWER, startingHumanness: 10 },
      { user: VIEWER, startingHumanness: 10 },
      { user: { id: ADMIN }, startingHumanness: 10 },
      { username: "person-admin", startingHumanness: 10 }
    ];
    for (const payload of named) {
      await expect(update(registry, viewer, payload)).resolves.toMatchObject({ ok: false, errorCode: IDENTITY_PREFERENCES_ERRORS.selfOnly });
      await expect(update(registry, admin, payload)).resolves.toMatchObject({ ok: false, errorCode: IDENTITY_PREFERENCES_ERRORS.selfOnly });
    }
    for (const payload of [{ userId: ADMIN }, { userId: VIEWER }, { id: ADMIN }, { user: ADMIN }, [ADMIN], "person.admin"]) {
      await expect(get(registry, viewer, payload)).resolves.toMatchObject({ ok: false, errorCode: IDENTITY_PREFERENCES_ERRORS.selfOnly });
    }
    await expect(get(registry, viewer)).resolves.toEqual({ ok: true, payload: { startingHumanness: null } });
    await expect(get(registry, admin)).resolves.toEqual({ ok: true, payload: { startingHumanness: null } });
  });

  it("takes the panel route's own authSessionId only when it is the caller's session", async () => {
    const { registry, viewer, admin } = await setup();
    await expect(update(registry, viewer, { startingHumanness: 25, authSessionId: viewer.sessionId })).resolves.toEqual({ ok: true, payload: { startingHumanness: 25 } });
    await expect(get(registry, viewer, { authSessionId: viewer.sessionId })).resolves.toEqual({ ok: true, payload: { startingHumanness: 25 } });
    await expect(update(registry, viewer, { startingHumanness: 90, authSessionId: admin.sessionId })).resolves.toMatchObject({ ok: false, errorCode: IDENTITY_PREFERENCES_ERRORS.selfOnly });
    await expect(get(registry, viewer, { authSessionId: admin.sessionId })).resolves.toMatchObject({ ok: false, errorCode: IDENTITY_PREFERENCES_ERRORS.selfOnly });
    await expect(get(registry, viewer)).resolves.toEqual({ ok: true, payload: { startingHumanness: 25 } });
  });

  it("never lets one person read or change another's value, an administrator included", async () => {
    const { registry, service, viewer, admin } = await setup();
    const before = (await service.snapshot()).users.find((user) => user.id === VIEWER)?.updatedAtMs;
    await update(registry, viewer, { startingHumanness: 70 });
    // Nor does the account's change time say the person changed a preference.
    expect((await service.snapshot()).users.find((user) => user.id === VIEWER)?.updatedAtMs).toBe(before);
    // The administrator's own calls reach only the administrator's value.
    await expect(get(registry, admin)).resolves.toEqual({ ok: true, payload: { startingHumanness: null } });
    await update(registry, admin, { startingHumanness: 10 });
    await expect(get(registry, viewer)).resolves.toEqual({ ok: true, payload: { startingHumanness: 70 } });
    // No other view of the viewer carries it: the snapshot, and the account edits an administrator makes.
    for (const caller of [admin, viewer]) {
      const snapshot = await registry.call<unknown, { users: Array<Record<string, unknown>> }>({ programId: "identity-access", endpoint: "snapshot", scope: {}, actor: caller, payload: {} });
      expect(snapshot.ok).toBe(true);
      for (const user of snapshot.payload?.users ?? []) expect(user).not.toHaveProperty("startingHumanness");
    }
    const renamed = await registry.call<unknown, Record<string, unknown>>({ programId: "identity-access", endpoint: "update-user", scope: {}, actor: admin, payload: { id: VIEWER, displayName: "Viewer Renamed", startingHumanness: 5 } });
    expect(renamed).toMatchObject({ ok: true, payload: { id: VIEWER, displayName: "Viewer Renamed" } });
    expect(renamed.payload).not.toHaveProperty("startingHumanness");
    await expect(service.upsertUser({ id: VIEWER, username: "person-viewer", displayName: "Viewer", roleId: "viewer" })).resolves.not.toHaveProperty("startingHumanness");
    // Neither edit changed it, and the viewer's own session still carries it.
    await expect(get(registry, viewer)).resolves.toEqual({ ok: true, payload: { startingHumanness: 70 } });
    expect((await service.validateSession(viewer.sessionId))?.user.startingHumanness).toBe(70);
    expect((await service.validateSession(admin.sessionId))?.user.startingHumanness).toBe(10);
  });

  it("is open to a person who holds only programs.read, and never to the assistant", async () => {
    const { registry, viewer } = await setup();
    expect(viewer.permissions).toEqual(["programs.read"]);
    await expect(update(registry, viewer, { startingHumanness: 15 })).resolves.toMatchObject({ ok: true });
    for (const endpoint of ["get-my-preferences", "update-my-preferences"]) {
      await expect(registry.call({ programId: "identity-access", endpoint, scope: {}, actor: viewer, via: "assistant", payload: { startingHumanness: 99 } })).resolves.toMatchObject({ ok: false, errorCode: "authorization.forbidden" });
    }
    await expect(get(registry, viewer)).resolves.toEqual({ ok: true, payload: { startingHumanness: 15 } });
  });

  it("refuses a call with no signed-in person", async () => {
    const { registry } = await setup();
    await expect(registry.call({ programId: "identity-access", endpoint: "get-my-preferences", scope: {}, payload: {} })).resolves.toMatchObject({ ok: false, errorCode: "authorization.required" });
    await expect(registry.call({ programId: "identity-access", endpoint: "update-my-preferences", scope: {}, payload: { startingHumanness: 1 } })).resolves.toMatchObject({ ok: false, errorCode: "authorization.required" });
  });
});

// The administrator's session revoke: by a raw id or by the digest the
// snapshot lists, so no raw id has to leave the server. Only a caller the
// registry admits by `identity.manage` reaches it, and the revoke reaches the
// session's listeners as that administrator. Passwords are dummy values;
// derivations run at the test-only N=2^10.

import { describe, expect, it } from "vitest";
import { GlobalProgramApiRegistry, type ProgramApiActor } from "../../../_shared/api.ts";
import { IdentityAccessService } from "../../runtime/service.ts";
import type { IdentitySessionRevoker } from "../../types.ts";
import { registerIdentityAccessApi } from "../handlers.ts";

const WEAK = { N: 2 ** 10, r: 8, p: 1, keyLength: 32 } as const;
const PASSWORD = "dummy-password";

async function setup() {
  const told: Array<[string, IdentitySessionRevoker]> = [];
  const service = new IdentityAccessService({ passwordKdf: { testOnlyWeakParameters: WEAK }, sessionRevocationSubscribers: [(sessionId, revoker) => { told.push([sessionId, revoker]); }] });
  await service.upsertUser({ id: "caller.admin", username: "caller-admin", displayName: "Caller Admin", roleId: "admin", password: PASSWORD });
  await service.upsertUser({ id: "target.viewer", username: "target-viewer", displayName: "Target Viewer", roleId: "viewer", password: PASSWORD });
  const admin = await service.authenticate({ username: "caller-admin", password: PASSWORD });
  const target = await service.authenticate({ username: "target-viewer", password: PASSWORD });
  const registry = new GlobalProgramApiRegistry();
  registerIdentityAccessApi(registry, service);
  const actor = (login: typeof admin): ProgramApiActor => ({ sessionId: login.session.id, userId: login.user.id, roleId: login.role.id, permissions: login.role.permissions });
  const digestOf = async (userId: string) => (await service.snapshot()).sessions.find((session) => session.userId === userId)?.id ?? "";
  const call = (caller: ProgramApiActor, payload: unknown) => registry.call({ programId: "identity-access", endpoint: "revoke-session", scope: {}, actor: caller, payload });
  return { service, told, admin, target, adminActor: actor(admin), targetActor: actor(target), digestOf, call };
}

describe("identity access revoke-session", () => {
  it("lets an administrator revoke another user's session by its digest, announced as that administrator", async () => {
    const { service, told, target, adminActor, digestOf, call } = await setup();
    await expect(call(adminActor, { sessionDigest: await digestOf("target.viewer") })).resolves.toMatchObject({ ok: true, payload: { revoked: true } });
    await expect(service.validateSession(target.session.id)).resolves.toBeNull();
    expect(told).toEqual([[target.session.id, { userId: "caller.admin", administrator: true }]]);
  });

  it("refuses a caller without identity.manage, by digest or raw id, before the handler runs", async () => {
    const { service, told, admin, targetActor, digestOf, call } = await setup();
    await expect(call(targetActor, { sessionDigest: await digestOf("caller.admin") })).resolves.toMatchObject({ ok: false, errorCode: "authorization.forbidden" });
    await expect(call(targetActor, { sessionId: admin.session.id })).resolves.toMatchObject({ ok: false, errorCode: "authorization.forbidden" });
    await expect(service.validateSession(admin.session.id)).resolves.not.toBeNull();
    expect(told).toEqual([]);
  });

  it("asks for exactly one of sessionId and sessionDigest, and refuses a malformed digest", async () => {
    const { adminActor, target, digestOf, call } = await setup();
    await expect(call(adminActor, {})).resolves.toMatchObject({ ok: false, error: "Exactly one of sessionId or sessionDigest is required" });
    await expect(call(adminActor, { sessionId: target.session.id, sessionDigest: await digestOf("target.viewer") })).resolves.toMatchObject({ ok: false });
    await expect(call(adminActor, { sessionDigest: "not-a-digest" })).resolves.toMatchObject({ ok: false, error: "Only an administrator can revoke a session by its digest" });
  });
});

describe("IdentityAccessService.revokeSession revoker", () => {
  it("lets the session's own user revoke it, and announces the presenter of a raw id as the session's own user", async () => {
    const { service, told, target, admin } = await setup();
    await expect(service.revokeSession(target.session.id, { userId: "target.viewer", administrator: false })).resolves.toBe(true);
    await expect(service.revokeSession(admin.session.id)).resolves.toBe(true);
    expect(told).toEqual([
      [target.session.id, { userId: "target.viewer", administrator: false }],
      [admin.session.id, { userId: "caller.admin", administrator: false }]
    ]);
  });

  it("refuses another user, and a digest from anyone but an administrator, leaving the session live", async () => {
    const { service, told, target, digestOf } = await setup();
    await expect(service.revokeSession(target.session.id, { userId: "caller.admin", administrator: false })).rejects.toThrow("Only the session's own user or an administrator can revoke it");
    await expect(service.revokeSession({ digest: await digestOf("target.viewer") }, { userId: "target.viewer", administrator: false })).rejects.toThrow("Only an administrator can revoke a session by its digest");
    await expect(service.revokeSession({ digest: await digestOf("target.viewer") })).rejects.toThrow("Only an administrator can revoke a session by its digest");
    await expect(service.validateSession(target.session.id)).resolves.not.toBeNull();
    expect(told).toEqual([]);
  });

  it("announces a raw id nobody here knows to no one", async () => {
    const { service, told } = await setup();
    await expect(service.revokeSession("session.unknown")).resolves.toBe(false);
    expect(told).toEqual([]);
  });
});

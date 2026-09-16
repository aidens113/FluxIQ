// Identity Access endpoint authorization: the endpoints that hand out authority
// — minting a session, creating an account, enrolling an authenticator,
// unlocking the vault — refuse to act until the calling session re-proves its
// credentials, and the endpoints that only take authority away stay available
// without one. Every password here is a dummy value, and derivations run at the
// test-only N=2^10.

import { describe, expect, it } from "vitest";
import { GlobalProgramApiRegistry, type ProgramApiActor } from "../../../_shared/api.ts";
import { IdentityAccessService } from "../../runtime/service.ts";
import { registerIdentityAccessApi } from "../handlers.ts";

const WEAK = { N: 2 ** 10, r: 8, p: 1, keyLength: 32 } as const;
const PASSWORD = "dummy-password";
const WRONG_PASSWORD = "dummy-password-wrong";
const CALLER = "caller.admin";
const TARGET = "target.viewer";

async function setup(): Promise<{
  service: IdentityAccessService;
  registry: GlobalProgramApiRegistry;
  actor: ProgramApiActor;
  sessionId: string;
}> {
  const service = new IdentityAccessService({ passwordKdf: { testOnlyWeakParameters: WEAK } });
  await service.upsertUser({ id: CALLER, username: "caller-admin", displayName: "Caller Admin", roleId: "admin", password: PASSWORD });
  await service.upsertUser({ id: TARGET, username: "target-viewer", displayName: "Target Viewer", roleId: "viewer", password: PASSWORD });
  const login = await service.authenticate({ username: "caller-admin", password: PASSWORD });
  const registry = new GlobalProgramApiRegistry();
  registerIdentityAccessApi(registry, service);
  return {
    service,
    registry,
    actor: { sessionId: login.session.id, userId: login.user.id, roleId: login.role.id, permissions: login.role.permissions },
    sessionId: login.session.id
  };
}

function call(registry: GlobalProgramApiRegistry, actor: ProgramApiActor, endpoint: string, payload: unknown) {
  return registry.call({ programId: "identity-access", endpoint, scope: {}, actor, payload });
}

describe("identity access endpoint authorization", () => {
  it("refuses to mint a session for another user without a credential recheck", async () => {
    const { service, registry, actor } = await setup();

    await expect(call(registry, actor, "create-session", { userId: TARGET })).resolves.toMatchObject({ ok: false, requiresRecheck: true });
    // Only the caller's own sign-in session exists; no session was minted for the target.
    expect((await service.snapshot()).sessions).toHaveLength(1);
  });

  it("refuses to mint a session when the recheck credentials are wrong", async () => {
    const { service, registry, actor, sessionId } = await setup();

    await expect(call(registry, actor, "create-session", {
      userId: TARGET,
      authSessionId: sessionId,
      authorizationPassword: WRONG_PASSWORD
    })).resolves.toMatchObject({ ok: false, requiresRecheck: true });
    expect((await service.snapshot()).sessions).toHaveLength(1);
  });

  it("mints a session once the calling session re-proves its credentials", async () => {
    const { service, registry, actor, sessionId } = await setup();

    const response = await call(registry, actor, "create-session", {
      userId: TARGET,
      authSessionId: sessionId,
      authorizationPassword: PASSWORD
    });

    expect(response.ok).toBe(true);
    expect(response.payload).toMatchObject({ userId: TARGET });
    expect((await service.snapshot()).sessions).toHaveLength(2);
  });

  it("refuses to unlock the vault without a credential recheck", async () => {
    const { service, registry, actor } = await setup();

    await expect(call(registry, actor, "unlock-vault", { userId: CALLER })).resolves.toMatchObject({ ok: false, requiresRecheck: true });
    expect((await service.snapshot()).vault.unlocked).toBe(false);
  });

  it("unlocks the vault once the calling session re-proves its credentials", async () => {
    const { service, registry, actor, sessionId } = await setup();

    const response = await call(registry, actor, "unlock-vault", {
      userId: CALLER,
      password: PASSWORD,
      authSessionId: sessionId,
      authorizationPassword: PASSWORD
    });

    expect(response).toMatchObject({ ok: true });
    expect((await service.snapshot()).vault.unlocked).toBe(true);
  });

  it("refuses to create an account without a credential recheck, and creates one after", async () => {
    const { service, registry, actor, sessionId } = await setup();
    const minted = { username: "minted-admin", displayName: "Minted Admin", roleId: "admin", password: PASSWORD };

    await expect(call(registry, actor, "create-user", minted)).resolves.toMatchObject({ ok: false, requiresRecheck: true });
    await expect(call(registry, actor, "create-user", { ...minted, authSessionId: sessionId, authorizationPassword: WRONG_PASSWORD }))
      .resolves.toMatchObject({ ok: false, requiresRecheck: true });
    // A created account outlives the session that made it, so a refusal must leave nothing behind.
    expect((await service.snapshot()).users.some((user) => user.username === "minted-admin")).toBe(false);

    await expect(call(registry, actor, "create-user", { ...minted, authSessionId: sessionId, authorizationPassword: PASSWORD }))
      .resolves.toMatchObject({ ok: true, payload: { username: "minted-admin", roleId: "admin" } });
    expect((await service.snapshot()).users.some((user) => user.username === "minted-admin")).toBe(true);
  });

  it("refuses to start an authenticator enrollment for another user without a credential recheck", async () => {
    const { registry, actor, sessionId } = await setup();

    await expect(call(registry, actor, "begin-totp", { userId: TARGET })).resolves.toMatchObject({ ok: false, requiresRecheck: true });
    await expect(call(registry, actor, "begin-totp", { userId: TARGET, authSessionId: sessionId, authorizationPassword: WRONG_PASSWORD }))
      .resolves.toMatchObject({ ok: false, requiresRecheck: true });

    const started = await call(registry, actor, "begin-totp", { userId: TARGET, authSessionId: sessionId, authorizationPassword: PASSWORD });
    expect(started.ok).toBe(true);
  });

  it("refuses to confirm an authenticator enrollment before the code is ever checked", async () => {
    const { service, registry, actor, sessionId } = await setup();
    await call(registry, actor, "begin-totp", { userId: TARGET, authSessionId: sessionId, authorizationPassword: PASSWORD });

    await expect(call(registry, actor, "confirm-totp", { userId: TARGET, code: "000000" })).resolves.toMatchObject({ ok: false, requiresRecheck: true });
    // Once the recheck passes the request reaches the service, and the service is what rejects the code.
    await expect(call(registry, actor, "confirm-totp", { userId: TARGET, code: "000000", authSessionId: sessionId, authorizationPassword: PASSWORD }))
      .resolves.toMatchObject({ ok: false, error: "Invalid TOTP code" });
    expect((await service.snapshot()).users.find((user) => user.id === TARGET)?.totpEnabled).toBe(false);
  });

  it("refuses to enable or disable an account without a credential recheck", async () => {
    const { service, registry, actor, sessionId } = await setup();
    const disabled = async () => (await service.snapshot()).users.find((user) => user.id === TARGET)?.enabled;

    await expect(call(registry, actor, "update-user", { id: TARGET, enabled: false })).resolves.toMatchObject({ ok: false, requiresRecheck: true });
    expect(await disabled()).toBe(true);

    await expect(call(registry, actor, "update-user", { id: TARGET, enabled: false, authSessionId: sessionId, authorizationPassword: PASSWORD }))
      .resolves.toMatchObject({ ok: true, payload: { enabled: false } });

    // Switching a disabled account back on is granting access again, so it is gated just as tightly.
    await expect(call(registry, actor, "update-user", { id: TARGET, enabled: true })).resolves.toMatchObject({ ok: false, requiresRecheck: true });
    expect(await disabled()).toBe(false);
    await expect(call(registry, actor, "update-user", { id: TARGET, enabled: true, authSessionId: sessionId, authorizationPassword: PASSWORD }))
      .resolves.toMatchObject({ ok: true, payload: { enabled: true } });
  });

  it("refuses a role change without a credential recheck, and says a recheck is what is missing", async () => {
    const { service, registry, actor, sessionId } = await setup();

    await expect(call(registry, actor, "update-user", { id: TARGET, roleId: "admin" })).resolves.toMatchObject({ ok: false, requiresRecheck: true });
    await expect(call(registry, actor, "update-user", { id: TARGET, roleId: "admin", authSessionId: sessionId, authorizationPassword: WRONG_PASSWORD }))
      .resolves.toMatchObject({ ok: false, requiresRecheck: true });
    expect((await service.snapshot()).users.find((user) => user.id === TARGET)?.roleId).toBe("viewer");

    await expect(call(registry, actor, "update-user", { id: TARGET, roleId: "admin", authSessionId: sessionId, authorizationPassword: PASSWORD }))
      .resolves.toMatchObject({ ok: true, payload: { roleId: "admin" } });
  });

  it("still renames an account without a recheck, since a name carries no authority", async () => {
    const { service, registry, actor } = await setup();

    await expect(call(registry, actor, "update-user", { id: TARGET, displayName: "Renamed Viewer", username: "renamed-viewer" }))
      .resolves.toMatchObject({ ok: true, payload: { displayName: "Renamed Viewer", roleId: "viewer", enabled: true } });
    expect((await service.snapshot()).users.find((user) => user.id === TARGET)?.displayName).toBe("Renamed Viewer");
  });

  it("keeps revoking a session and locking the vault available without a recheck, since both only take authority away", async () => {
    const { service, registry, actor, sessionId } = await setup();

    await expect(call(registry, actor, "lock-vault", {})).resolves.toMatchObject({ ok: true });
    await expect(call(registry, actor, "revoke-session", { sessionId })).resolves.toMatchObject({ ok: true, payload: { revoked: true } });
    expect((await service.snapshot()).sessions).toHaveLength(0);
    expect((await service.snapshot()).vault.unlocked).toBe(false);
  });
});

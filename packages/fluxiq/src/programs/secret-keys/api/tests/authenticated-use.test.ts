import { afterEach, describe, expect, it } from "vitest";
import { GlobalProgramApiRegistry, type ProgramApiActor } from "../../../_shared/api.ts";
import { IdentityAccessService } from "../../../identity-access/index.ts";
import { SecretKeysService } from "../../runtime/service.ts";
import { AesGcmSecretKeyHostProtection } from "../../../../platform/custody/protection/index.ts";
import { createSecretKeyManagementProof, type SecretKeyManagementProof } from "../../runtime/access/index.ts";
import { createMemoryRepository, WEAK_SCRYPT_PARAMETERS } from "../../runtime/tests/secret-key-fixtures.ts";
import { registerSecretKeysApi } from "../handlers.ts";

const services: SecretKeysService[] = [];
afterEach(() => services.splice(0).forEach(service => service.close()));

async function primaryAndTenant() {
  const primary = new IdentityAccessService({ passwordKdf: { testOnlyWeakParameters: WEAK_SCRYPT_PARAMETERS } });
  await primary.upsertUser({ id: "user.alice", username: "alice", displayName: "Alice", roleId: "admin", password: "synthetic-alice" });
  await primary.upsertUser({ id: "user.bob", username: "bob", displayName: "Bob", roleId: "admin", password: "synthetic-bob" });
  const alice = await primary.authenticate({ username: "alice", password: "synthetic-alice" });
  const bob = await primary.authenticate({ username: "bob", password: "synthetic-bob" });
  const repository = createMemoryRepository();
  const protector = new AesGcmSecretKeyHostProtection(() => ({ keyId: "synthetic-host", key: Buffer.alloc(32, 13) }));
  let nextOpen: (() => Promise<void>) | undefined;
  const service = new SecretKeysService({ repository: repository.repository,
    hostProtection: {
      seal: input => protector.seal(input),
      open: async input => {
        const pause = nextOpen;
        nextOpen = undefined;
        await pause?.();
        return protector.open(input);
      }
    },
    protectionStoreId: "tenant.alice", passwordKdf: { testOnlyWeakParameters: WEAK_SCRYPT_PARAMETERS },
    useAuthority: async ({ principal, key }) => {
      const auth = principal.kind === "session" ? await primary.validateSession(principal.sessionId) : null;
      return auth?.user.id === principal.userId && key.createdBy === principal.userId ? { ownerUserId: principal.userId, expiresAtMs: auth.session.expiresAtMs } : null;
    }
  });
  services.push(service);
  const registry = new GlobalProgramApiRegistry();
  let resolved = 0;
  registerSecretKeysApi(registry, service, async () => {
    resolved += 1;
    return primary;
  }, actor => ({ sessionId: actor.sessionId }));
  const actor = (login: typeof alice): ProgramApiActor => ({ sessionId: login.session.id, userId: login.user.id, roleId: login.role.id, permissions: login.role.permissions });
  const create = (login: typeof alice, proofSession = login.session.id, password = "synthetic-alice") => registry.call({
    programId: "secret-keys", endpoint: "create-key", scope: {}, actor: actor(login),
    payload: { name: "Tenant model", kind: "llm", provider: "anthropic", value: "synthetic-tenant-value", authSessionId: proofSession, authorizationPassword: password }
  });
  function pauseNextOpen() {
    let begin = () => {};
    let release = () => {};
    const started = new Promise<void>(resolve => { begin = resolve; });
    const gate = new Promise<void>(resolve => { release = resolve; });
    nextOpen = async () => {
      begin();
      await gate;
    };
    return { started, release };
  }
  const revealKey = (id: string, password: string) => registry.call({ programId: "secret-keys", endpoint: "reveal-key", scope: {}, actor: actor(alice), payload: { id, authSessionId: alice.session.id, authorizationPassword: password } });
  return { primary, service, repository, registry, alice, bob, create, revealKey, pauseNextOpen, resolved: () => resolved };
}

describe("primary identity with isolated tenant key storage", () => {
  it("uses a real primary user's session to configure and immediately use a tenant key", async () => {
    const f = await primaryAndTenant();
    const created = await f.create(f.alice);
    expect(created.ok, created.error).toBe(true);
    const id = (created.payload as { id: string }).id;
    expect(f.repository.stored(id)?.createdBy).toBe(f.alice.user.id);
    expect(f.repository.stored(id)?.hostProtection).toBeDefined();
    expect(f.resolved()).toBeGreaterThan(0);
    const authorization = await f.service.access.createUseAuthorization({ id, principal: { kind: "session", userId: f.alice.user.id, sessionId: f.alice.session.id } });
    await expect(f.service.revealKeyWithAuthorization({ id, authorizationId: authorization.authorizationId })).resolves.toMatchObject({ value: "synthetic-tenant-value" });
    await expect(f.service.access.createUseAuthorization({ id, principal: { kind: "session", userId: f.bob.user.id, sessionId: f.bob.session.id } })).rejects.toThrow("not authorized");
  });

  it("rejects another actor's proof even when its password is correct", async () => {
    const f = await primaryAndTenant();
    expect(await f.create(f.bob, f.alice.session.id, "synthetic-alice")).toMatchObject({ ok: false, requiresRecheck: true });
    expect((await f.service.snapshot()).keys).toEqual([]);
    // Naming Alice while presenting Bob's actual session must also fail.
    const forged = await f.registry.call({ programId: "secret-keys", endpoint: "create-key", scope: {}, actor: { sessionId: f.bob.session.id, userId: f.alice.user.id, roleId: f.bob.role.id, permissions: f.bob.role.permissions }, payload: { name: "Forged", value: "synthetic", authSessionId: f.bob.session.id, authorizationPassword: "synthetic-bob" } });
    expect(forged).toMatchObject({ ok: false, requiresRecheck: true });
    expect((await f.service.snapshot()).keys).toEqual([]);
  });

  it("does not accept an identity authority in request data and refuses the retired unlock endpoint", async () => {
    const f = await primaryAndTenant();
    const result = await f.registry.call({ programId: "secret-keys", endpoint: "unlock", scope: {}, actor: { sessionId: f.alice.session.id, userId: f.alice.user.id, roleId: f.alice.role.id, permissions: f.alice.role.permissions }, payload: { identityAuthority: { userId: "forged" }, authorizationPassword: "synthetic-alice" } });
    expect(result).toMatchObject({ ok: false });
  });

  it("reveals an isolated old tenant seal after primary password change using current-password reauthentication", async () => {
    const f = await primaryAndTenant();
    const created = await f.create(f.alice);
    const id = (created.payload as { id: string }).id;
    const oldSeal = f.repository.stored(id)?.sealed;
    await f.primary.setPasswordAuthorized({ userId: f.alice.user.id, sessionId: f.alice.session.id, authorizationPassword: "synthetic-alice", authorizationPin: undefined, authorizationTotp: undefined, password: "synthetic-next" });
    expect(await f.revealKey(id, "synthetic-alice")).toMatchObject({ ok: false, requiresRecheck: true });
    expect(await f.revealKey(id, "synthetic-next")).toMatchObject({ ok: true, payload: { value: "synthetic-tenant-value" } });
    expect(f.repository.stored(id)?.sealed).toEqual(oldSeal);
    // A user id plus the current password alone cannot bypass the old value seal in the low-level API.
    await expect(f.service.revealKey({ id, actorUserId: f.alice.user.id, authorizationPassword: "synthetic-next" })).rejects.toThrow("could not be opened");
  });

  it("refuses a management proof when the primary session is revoked during host unwrapping", async () => {
    const f = await primaryAndTenant();
    const created = await f.create(f.alice);
    const id = (created.payload as { id: string }).id;
    const pause = f.pauseNextOpen();
    const revealing = f.revealKey(id, "synthetic-alice");
    await pause.started;
    await f.primary.revokeSession(f.alice.session.id);
    pause.release();
    const refused = await revealing;
    expect(refused.ok).toBe(false);
    expect(JSON.stringify(refused)).not.toContain("synthetic-tenant-value");
  });

  it("keeps model-use grants separate from one-use management proof objects", async () => {
    const f = await primaryAndTenant();
    const created = await f.create(f.alice);
    const id = (created.payload as { id: string }).id;
    const model = await f.service.access.createUseAuthorization({ id, principal: { kind: "session", userId: f.alice.user.id, sessionId: f.alice.session.id } });
    await expect(f.service.revealKey({ id, authorizationPassword: "synthetic-alice", managementProof: model as unknown as SecretKeyManagementProof })).rejects.toThrow("management proof");
    const proof = createSecretKeyManagementProof({ id, userId: f.alice.user.id, operation: "reveal", expiresAtMs: Date.now() + 10_000, validate: async () => Boolean(await f.primary.validateSession(f.alice.session.id)) });
    await expect(f.service.revealKey({ id, authorizationPassword: "synthetic-alice", managementProof: proof })).resolves.toMatchObject({ value: "synthetic-tenant-value" });
    await expect(f.service.revealKey({ id, authorizationPassword: "synthetic-alice", managementProof: proof })).rejects.toThrow("management proof");
    const expired = createSecretKeyManagementProof({ id, userId: f.alice.user.id, operation: "reveal", expiresAtMs: Date.now() - 1, validate: async () => true });
    await expect(f.service.revealKey({ id, authorizationPassword: "synthetic-alice", managementProof: expired })).rejects.toThrow("management proof");
  });

  it("rechecks current role permissions instead of retaining the request's administrator role", async () => {
    const f = await primaryAndTenant();
    const created = await f.create(f.alice);
    const id = (created.payload as { id: string }).id;
    const pause = f.pauseNextOpen();
    const revealing = f.revealKey(id, "synthetic-alice");
    await pause.started;
    await f.primary.upsertUser({ id: f.alice.user.id, username: "alice", displayName: "Alice", roleId: "viewer" });
    expect((await f.primary.validateSession(f.alice.session.id))?.role.id).toBe("viewer");
    pause.release();
    const denied = await revealing;
    expect(denied.ok).toBe(false);
    expect(JSON.stringify(denied)).not.toContain("synthetic-tenant-value");
  });
});

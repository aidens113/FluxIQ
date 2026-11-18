// A key saved or replaced since t928 is sealed for host protection (version 3):
// no password, PIN or sign-in is asked for or used, and its owner's calls use
// it at once, after a restart too. Keys sealed under a password before then
// keep opening as they did, and the owner's next sign-in makes each one the
// server can open. Dummy values only.

import { describe, expect, it } from "vitest";
import { AesGcmSecretKeyHostProtection } from "../../../../platform/custody/protection/index.ts";
import type { SecretKeyUsePrincipal } from "../access/index.ts";
import { SecretKeysService } from "../service.ts";
import {
  WEAK_SCRYPT_PARAMETERS,
  createDeriveProbe,
  createMemoryRepository,
  createPasswordSealedKey,
  hostProtectionOptions,
  legacyV1Record,
  serviceRecord
} from "./secret-key-fixtures.ts";

const NOW = 1_000_000;
const PASSWORD = "dummy-password";
const VALUE = "dummy-provider-value";
const weakKdf = { testOnlyWeakParameters: WEAK_SCRYPT_PARAMETERS };

function workspace(options: { repository?: ReturnType<typeof createMemoryRepository>; protection?: boolean; derive?: ReturnType<typeof createDeriveProbe> } = {}) {
  const store = options.repository ?? createMemoryRepository();
  const service = new SecretKeysService({
    repository: store.repository,
    now: () => NOW,
    passwordKdf: options.derive ? { ...weakKdf, derive: options.derive.derive } : weakKdf,
    ...(options.protection === false ? {} : hostProtectionOptions()),
    useAuthority: async ({ principal, key }) => (key.createdBy === principal.userId ? { ownerUserId: principal.userId, expiresAtMs: NOW + 60_000 } : null)
  });
  return { service, store };
}

/** A model call's use: a one-use authorization for an authenticated principal, released once. */
async function use(service: SecretKeysService, id: string, principal: SecretKeyUsePrincipal = { kind: "session", userId: "user.one", sessionId: "session.never-unlocked" }): Promise<string> {
  const authorization = await service.access.createUseAuthorization({ id, principal });
  return (await service.revealKeyWithAuthorization({ id, authorizationId: authorization.authorizationId })).value;
}

describe("a key saved with no password", () => {
  it("is sealed for host protection, never stored in plain text, and usable by its owner at once and after a restart", async () => {
    const { service, store } = workspace();
    const key = await service.createKey({ name: "Model", value: VALUE, provider: "Anthropic", createdBy: "user.one", nowMs: NOW });

    const stored = store.stored(key.id)!;
    expect(stored.sealed).toMatchObject({ version: 3, algorithm: "aes-256-gcm" });
    expect(stored.sealed).not.toHaveProperty("salt");
    expect(stored.hostProtection?.ownerUserId).toBe("user.one");
    expect(store.storedText(key.id)).not.toContain(VALUE);
    // No session ever unlocked anything, and the owner's call still opens it.
    expect(service.activeSessionUnlockCount()).toBe(0);
    await expect(use(service, key.id)).resolves.toBe(VALUE);
    await expect(service.access.availability(serviceRecord(service, key.id)!)).resolves.toEqual({ state: "available" });
    service.close();

    const restarted = workspace({ repository: store }).service;
    await expect(use(restarted, key.id, { kind: "client", userId: "user.one", trustedClientId: "client.one" })).resolves.toBe(VALUE);
    restarted.close();
  });

  it("is refused in plain words, with nothing written, when nobody would own it or host protection cannot keep it", async () => {
    const unprotected = workspace({ protection: false });
    await expect(unprotected.service.createKey({ name: "Model", value: VALUE, createdBy: "user.one" })).rejects.toThrow("The key was not saved because this server's key protection is not available");
    expect(unprotected.store.putCount()).toBe(0);

    const ownerless = workspace();
    await expect(ownerless.service.createKey({ name: "Model", value: VALUE })).rejects.toThrow("Sign in to save a key");
    expect(ownerless.store.putCount()).toBe(0);

    // Configured, but its key cannot be read now: still refused, never saved unopenable.
    const store = createMemoryRepository();
    const broken = new SecretKeysService({ repository: store.repository, passwordKdf: weakKdf, hostProtection: new AesGcmSecretKeyHostProtection(() => undefined), protectionStoreId: "test-store" });
    await expect(broken.createKey({ name: "Model", value: VALUE, createdBy: "user.one" })).rejects.toThrow("The key was not saved because this server's key protection is not available");
    expect(store.putCount()).toBe(0);
    expect((await broken.snapshot()).keys).toEqual([]);
  });

  it("is never opened or derived for by a password, and a password reveal without the owner's proof opens nothing", async () => {
    const derive = createDeriveProbe();
    const { service } = workspace({ derive });
    const key = await service.createKey({ name: "Model", value: VALUE, createdBy: "user.one", nowMs: NOW });
    const before = derive.count();
    await expect(service.unlockSession({ sessionId: "session.one", userId: "user.one", authorizationPassword: PASSWORD, expiresAtMs: NOW + 60_000 })).resolves.toMatchObject({ unlockedKeyCount: 0 });
    await expect(service.revealKey({ id: key.id, authorizationPassword: PASSWORD })).rejects.toThrow("could not be opened");
    expect(derive.count()).toBe(before);
    service.close();
  });

  it("keeps saving order for keys saved in one millisecond, so the first saved is the default, every time", async () => {
    // Sealing for the host is instant, so saves can share a millisecond; the default must not fall to a random id.
    for (let round = 0; round < 5; round += 1) {
      const { service } = workspace();
      const first = await service.createKey({ name: "First", value: VALUE, provider: "Anthropic", createdBy: "user.one", nowMs: NOW });
      const second = await service.createKey({ name: "Second", value: VALUE, provider: "Anthropic", createdBy: "user.one", nowMs: NOW });
      const [third] = await Promise.all([service.createKey({ name: "Third", value: VALUE, provider: "Anthropic", createdBy: "user.one", nowMs: NOW })]);
      expect(second.createdAtMs).toBeGreaterThan(first.createdAtMs);
      expect(third!.createdAtMs).toBeGreaterThan(second.createdAtMs);
      expect((await service.modelKeys.read()).defaultKeyId).toBe(first.id);
      service.close();
    }
  });
});

describe("a key's value replaced with no password", () => {
  it("is sealed for host protection for the key's owner, and the old value is gone", async () => {
    const { service, store } = workspace();
    const key = await service.createKey({ name: "Model", value: VALUE, createdBy: "user.one", nowMs: NOW });
    const rotated = await service.rotateKey({ id: key.id, value: "dummy-next-value", actorUserId: "user.one", nowMs: NOW + 10 });
    expect(rotated.lastRotatedAtMs).toBe(NOW + 10);
    expect(store.stored(key.id)?.sealed.version).toBe(3);
    expect(store.storedText(key.id)).not.toContain("dummy-next-value");
    await expect(use(service, key.id)).resolves.toBe("dummy-next-value");
    service.close();
  });

  it("turns a password-sealed key into a host-sealed one for its owner, and gives an unowned old key to the person replacing it", async () => {
    const { service, store } = workspace();
    const owned = await createPasswordSealedKey(service, { name: "Old", value: VALUE, authorizationPassword: PASSWORD, createdBy: "user.one", nowMs: NOW });
    await service.rotateKey({ id: owned.id, value: "dummy-owned-next", actorUserId: "user.two", nowMs: NOW + 10 });
    expect(store.stored(owned.id)).toMatchObject({ createdBy: "user.one", sealed: { version: 3 }, hostProtection: { ownerUserId: "user.one" } });
    await expect(use(service, owned.id)).resolves.toBe("dummy-owned-next");

    const unowned = await createPasswordSealedKey(service, { name: "Unowned", value: VALUE, authorizationPassword: PASSWORD, nowMs: NOW });
    await service.rotateKey({ id: unowned.id, value: "dummy-claimed-next", actorUserId: "user.two", nowMs: NOW + 10 });
    expect(store.stored(unowned.id)).toMatchObject({ createdBy: "user.two", hostProtection: { ownerUserId: "user.two" } });
    await expect(use(service, unowned.id, { kind: "session", userId: "user.two", sessionId: "session.two" })).resolves.toBe("dummy-claimed-next");
    service.close();
  });
});

describe("a model call's use of a key", () => {
  it("writes nothing: no lastRevealedAtMs and no store write, while the person's own reveal still records one", async () => {
    const { service, store } = workspace();
    const key = await service.createKey({ name: "Model", value: VALUE, createdBy: "user.one", nowMs: NOW });
    const puts = store.putCount();
    await expect(use(service, key.id)).resolves.toBe(VALUE);
    expect(store.putCount()).toBe(puts);
    expect(store.stored(key.id)).not.toHaveProperty("lastRevealedAtMs");
    expect(serviceRecord(service, key.id)).not.toHaveProperty("lastRevealedAtMs");

    const old = await createPasswordSealedKey(service, { name: "Old", value: VALUE, authorizationPassword: PASSWORD, nowMs: NOW });
    await expect(service.revealKey({ id: old.id, authorizationPassword: PASSWORD, nowMs: NOW + 5 })).resolves.toMatchObject({ value: VALUE, key: { lastRevealedAtMs: NOW + 5 } });
    service.close();
  });
});

describe("an old-format key at its owner's sign-in", () => {
  it("still opens with the password, and becomes one the server opens with no password", async () => {
    const legacy = legacyV1Record({ id: "secret:legacy", value: VALUE, password: PASSWORD });
    const store = createMemoryRepository([legacy]);
    const { service } = workspace({ repository: store });
    await service.snapshot();
    await expect(service.access.availability(serviceRecord(service, legacy.id)!)).resolves.toEqual({ state: "unavailable", code: "legacy_recovery_required" });
    let changes = 0;
    service.onModelKeysChanged(() => { changes += 1; });

    await expect(service.unlockSession({ sessionId: "session.one", userId: "user.one", authorizationPassword: PASSWORD, expiresAtMs: NOW + 60_000 })).resolves.toMatchObject({ unlockedKeyCount: 1 });

    // Nobody owned it, and this person's password sealed it: it is theirs now, and wrapped for them.
    expect(store.stored(legacy.id)).toMatchObject({ createdBy: "user.one", hostProtection: { ownerUserId: "user.one" } });
    expect(changes).toBeGreaterThan(0);
    service.close();
    const restarted = workspace({ repository: store }).service;
    await restarted.snapshot();
    await expect(restarted.access.availability(serviceRecord(restarted, legacy.id)!)).resolves.toEqual({ state: "available" });
    await expect(use(restarted, legacy.id, { kind: "client", userId: "user.one", trustedClientId: "client.one" })).resolves.toBe(VALUE);
    await expect(restarted.revealKey({ id: legacy.id, authorizationPassword: PASSWORD })).resolves.toMatchObject({ value: VALUE });
    restarted.close();
  });

  it("is wrapped for its owner when it was saved before host protection, and a wrong password changes nothing", async () => {
    const store = createMemoryRepository();
    const before = workspace({ repository: store, protection: false }).service;
    const key = await createPasswordSealedKey(before, { name: "Old", value: VALUE, authorizationPassword: PASSWORD, createdBy: "user.one", nowMs: NOW });
    expect(store.stored(key.id)?.hostProtection).toBeUndefined();
    before.close();

    const { service } = workspace({ repository: store });
    const puts = store.putCount();
    await expect(service.unlockSession({ sessionId: "session.wrong", userId: "user.one", authorizationPassword: "wrong-dummy-password", expiresAtMs: NOW + 60_000 })).resolves.toMatchObject({ unlockedKeyCount: 0 });
    expect(store.putCount()).toBe(puts);
    await service.unlockSession({ sessionId: "session.one", userId: "user.one", authorizationPassword: PASSWORD, expiresAtMs: NOW + 60_000 });
    expect(store.stored(key.id)?.hostProtection?.ownerUserId).toBe("user.one");
    service.close();
    await expect(use(workspace({ repository: store }).service, key.id)).resolves.toBe(VALUE);
  });

  it("is left unowned and unwrapped when this server has no host protection to wrap it with", async () => {
    const legacy = legacyV1Record({ id: "secret:legacy", value: VALUE, password: PASSWORD });
    const store = createMemoryRepository([legacy]);
    const { service } = workspace({ repository: store, protection: false });
    await expect(service.unlockSession({ sessionId: "session.one", userId: "user.one", authorizationPassword: PASSWORD, expiresAtMs: NOW + 60_000 })).resolves.toMatchObject({ unlockedKeyCount: 1 });
    expect(store.stored(legacy.id)).not.toHaveProperty("createdBy");
    expect(store.stored(legacy.id)?.hostProtection).toBeUndefined();
    service.close();
  });

  it("keeps a replacement saved while its sign-in upgrade is being written", async () => {
    const legacy = legacyV1Record({ id: "secret:legacy", value: VALUE, password: PASSWORD });
    const store = createMemoryRepository([legacy]);
    const { service } = workspace({ repository: store });
    const writing = store.holdNextPut();
    const unlocking = service.unlockSession({ sessionId: "session.one", userId: "user.one", authorizationPassword: PASSWORD, expiresAtMs: NOW + 60_000 });
    await writing.started;
    const replacing = service.rotateKey({ id: legacy.id, value: "dummy-replaced", actorUserId: "user.one", nowMs: NOW });
    writing.release();
    await replacing;
    await unlocking;

    expect(store.stored(legacy.id)).toMatchObject({ createdBy: "user.one", sealed: { version: 3 }, hostProtection: { ownerUserId: "user.one" } });
    expect(store.stored(legacy.id)?.sealed).toEqual(serviceRecord(service, legacy.id)?.sealed);
    service.close();
    await expect(use(workspace({ repository: store }).service, legacy.id)).resolves.toBe("dummy-replaced");
  });
});

describe("onModelKeysChanged", () => {
  it("is told after every committed change to the keys or the model-key choices, and no more once stopped", async () => {
    const { service } = workspace();
    let changes = 0;
    const stop = service.onModelKeysChanged(() => { changes += 1; });
    const counted = async (work: () => Promise<unknown>) => {
      const start = changes;
      await work();
      return changes - start;
    };
    const key = await service.createKey({ name: "Model", value: VALUE, provider: "Anthropic", createdBy: "user.one" });
    expect(changes).toBe(1);
    expect(await counted(() => service.updateKey({ id: key.id, name: "Renamed" }))).toBe(1);
    expect(await counted(() => service.rotateKey({ id: key.id, value: "dummy-next", actorUserId: "user.one" }))).toBe(1);
    expect(await counted(() => service.modelKeys.setOffered(key.id, true, "user.one"))).toBe(1);
    expect(await counted(() => service.modelKeys.setDefault(key.id, "user.one"))).toBe(1);
    expect(await counted(() => service.modelKeys.setAssistant({ keyId: key.id, chosenBy: "user.one" }))).toBe(1);
    expect(await counted(() => service.modelKeys.setAssistantAllowance(1))).toBe(1);
    expect(await counted(() => service.deleteKey(key.id))).toBe(1);
    expect(await counted(() => service.deleteKey(key.id))).toBe(0);
    // A refused change is not a change.
    expect(await counted(() => service.createKey({ name: "Model", value: VALUE }).catch((error: unknown) => error))).toBe(0);
    stop();
    await service.createKey({ name: "Later", value: VALUE, createdBy: "user.one" });
    expect(await counted(async () => undefined)).toBe(0);
    service.close();
  });

  it("keeps the write when a listener throws", async () => {
    const { service } = workspace();
    let told = 0;
    service.onModelKeysChanged(() => {
      throw new Error("listener failed");
    });
    service.onModelKeysChanged(() => { told += 1; });
    await expect(service.createKey({ name: "Model", value: VALUE, createdBy: "user.one" })).resolves.toMatchObject({ name: "Model" });
    expect(told).toBe(1);
    expect((await service.snapshot()).keys).toHaveLength(1);
    service.close();
  });
});

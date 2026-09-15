import { createHash } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { decodeKdfSalt, type DeriveScryptKeyFn } from "../../../_shared/password-kdf/index.ts";
import { SQLiteRepository } from "../../../database-manager/index.ts";
import { SecretKeysService } from "../service.ts";
import {
  WEAK_SCRYPT_PARAMETERS,
  claimThroughSession,
  createDeriveProbe,
  createMemoryRepository,
  legacyV1Record,
  serviceRecord
} from "./secret-key-fixtures.ts";

const weakKdf = { testOnlyWeakParameters: WEAK_SCRYPT_PARAMETERS };
const PASSWORD = "dummy-password";

afterEach(() => vi.useRealTimers());

describe("SecretKeysService", () => {
  it("stores encrypted secret values and returns redacted snapshots", async () => {
    const service = new SecretKeysService({ passwordKdf: weakKdf });

    const key = await service.createKey({
      name: "OpenAI production",
      value: "sk-live-secret",
      authorizationPassword: "admin",
      provider: "OpenAI",
      nowMs: 1000
    });

    expect(key).toMatchObject({ name: "OpenAI production", kind: "llm", provider: "OpenAI", enabled: true });
    expect(JSON.stringify(await service.snapshot())).not.toContain("sk-live-secret");
    await expect(service.revealKey({ id: key.id, authorizationPassword: "wrong" })).rejects.toThrow();
    await expect(service.revealKey({ id: key.id, authorizationPassword: "admin", nowMs: 2000 })).resolves.toMatchObject({
      value: "sk-live-secret",
      key: { lastRevealedAtMs: 2000 }
    });
  });

  it("persists version 2 sealed payloads that record their parameters, without storing plaintext values", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "fluxiq-secrets-"));
    try {
      const repository = new SQLiteRepository({ rootDir: root, kind: SecretKeysService.storeKind });
      const first = new SecretKeysService({ repository, passwordKdf: weakKdf });
      const key = await first.createKey({
        name: "Custom token",
        value: "custom-secret-value",
        authorizationPassword: "admin",
        kind: "custom",
        nowMs: 1000
      });

      const stored = await repository.get(key.id, {});
      expect(stored?.kind).toBe("secret.keys");
      expect(JSON.stringify(stored?.data)).not.toContain("custom-secret-value");
      expect(stored?.data.encrypted).toBe(true);
      expect(stored?.data.sealed).toMatchObject({ version: 2, algorithm: "aes-256-gcm", kdf: "scrypt", kdfParams: { N: 1024, r: 8, p: 1, keyLength: 32 } });
      expect(decodeKdfSalt(String((stored?.data.sealed as { salt?: unknown } | undefined)?.salt))?.length).toBe(16);

      const second = new SecretKeysService({ repository: new SQLiteRepository({ rootDir: root, kind: SecretKeysService.storeKind }), passwordKdf: weakKdf });
      await expect(second.revealKey({ id: key.id, authorizationPassword: "admin" })).resolves.toMatchObject({ value: "custom-secret-value" });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("issues opaque one-use reveal authorizations and zeroes derived key material", async () => {
    const service = new SecretKeysService({ now: () => 1000, passwordKdf: weakKdf });
    const key = await service.createKey({
      name: "DeepSeek",
      value: "provider-secret",
      authorizationPassword: "account-password",
      provider: "deepseek",
      nowMs: 1000
    });

    const authorization = await service.createRevealAuthorization({
      id: key.id,
      authorizationPassword: "account-password",
      ttlMs: 1000,
      nowMs: 1000
    });
    expect(JSON.stringify(authorization)).not.toContain("account-password");
    expect(JSON.stringify(authorization)).not.toContain("provider-secret");
    expect(service.activeRevealAuthorizationCount()).toBe(1);
    const storedAuthorization = (service as any).heldKeys.authorization(authorization.authorizationId);
    expect(storedAuthorization).not.toHaveProperty("authorizationPassword");
    expect(storedAuthorization).not.toHaveProperty("value");
    const derivedKey = storedAuthorization.decryptionKey as Buffer;

    await expect(service.revealKeyWithAuthorization({ authorizationId: authorization.authorizationId, id: key.id, nowMs: 1000 })).resolves.toMatchObject({ value: "provider-secret" });
    expect(service.activeRevealAuthorizationCount()).toBe(0);
    expect([...derivedKey].every((byte) => byte === 0)).toBe(true);
    await expect(service.revealKeyWithAuthorization({ authorizationId: authorization.authorizationId, id: key.id, nowMs: 1000 })).rejects.toThrow("unavailable");
  });

  it("derives session-scoped unlock keys at login and revokes all copied key material", async () => {
    vi.useFakeTimers();
    let now = 1000;
    const service = new SecretKeysService({ now: () => now, passwordKdf: weakKdf });
    const key = await service.createKey({
      name: "DeepSeek",
      value: "provider-secret",
      authorizationPassword: "account-password",
      provider: "deepseek",
      nowMs: now
    });

    const unlock = await service.unlockSession({
      sessionId: "session.one",
      userId: "user.one",
      authorizationPassword: "account-password",
      expiresAtMs: 3000,
      nowMs: now
    });
    expect(unlock).toEqual({ sessionId: "session.one", expiresAtMs: 3000, unlockedKeyCount: 1 });
    expect(JSON.stringify(unlock)).not.toContain("account-password");
    const storedUnlock = (service as any).heldKeys.session("session.one");
    expect(storedUnlock).not.toHaveProperty("authorizationPassword");
    const sessionKey = storedUnlock.decryptionKeys.get(key.id).decryptionKey as Buffer;

    const authorization = await service.createSessionRevealAuthorization({
      sessionId: "session.one",
      userId: "user.one",
      id: key.id,
      ttlMs: 1000,
      nowMs: now
    });
    const authorizationKey = (service as any).heldKeys.authorization(authorization.authorizationId).decryptionKey as Buffer;
    expect(authorizationKey).not.toBe(sessionKey);
    service.revokeSessionUnlock("session.one");
    expect(service.activeSessionUnlockCount()).toBe(0);
    expect(service.activeRevealAuthorizationCount()).toBe(0);
    expect([...sessionKey].every((byte) => byte === 0)).toBe(true);
    expect([...authorizationKey].every((byte) => byte === 0)).toBe(true);
    await expect(service.createSessionRevealAuthorization({ sessionId: "session.one", userId: "user.one", id: key.id })).rejects.toThrow("unavailable");
  });

  it("expires session unlocks and does not retain unusable password-derived keys", async () => {
    vi.useFakeTimers();
    let now = 1000;
    const service = new SecretKeysService({ now: () => now, passwordKdf: weakKdf });
    await service.createKey({ name: "DeepSeek", value: "provider-secret", authorizationPassword: "right", nowMs: now });
    const wrong = await service.unlockSession({ sessionId: "session.wrong", userId: "user.one", authorizationPassword: "wrong", expiresAtMs: 2000, nowMs: now });
    expect(wrong.unlockedKeyCount).toBe(0);
    const unlocked = await service.unlockSession({ sessionId: "session.right", userId: "user.one", authorizationPassword: "right", expiresAtMs: 2000, nowMs: now });
    expect(unlocked.unlockedKeyCount).toBe(1);
    now = 2000;
    await vi.advanceTimersByTimeAsync(1000);
    expect(service.activeSessionUnlockCount()).toBe(0);
  });

  it("actively expires, closes, and invalidates reveal authorizations when a key changes", async () => {
    vi.useFakeTimers();
    let now = 1000;
    const service = new SecretKeysService({ now: () => now, passwordKdf: weakKdf });
    const key = await service.createKey({ name: "DeepSeek", value: "one", authorizationPassword: "account-password", nowMs: now });
    await service.createRevealAuthorization({ id: key.id, authorizationPassword: "account-password", ttlMs: 1000, nowMs: now });
    expect(service.activeRevealAuthorizationCount()).toBe(1);
    now = 2000;
    await vi.advanceTimersByTimeAsync(1000);
    expect(service.activeRevealAuthorizationCount()).toBe(0);

    await service.createRevealAuthorization({ id: key.id, authorizationPassword: "account-password", ttlMs: 1000, nowMs: now });
    await service.updateKey({ id: key.id, enabled: false, nowMs: now + 1 });
    expect(service.activeRevealAuthorizationCount()).toBe(0);

    await service.createRevealAuthorization({ id: key.id, authorizationPassword: "account-password", ttlMs: 1000, nowMs: now + 1 });
    service.close();
    expect(service.activeRevealAuthorizationCount()).toBe(0);
  });

  it("fails closed when persistence delays a claimed reveal beyond its TTL", async () => {
    let now = 1000;
    let putCount = 0;
    let releasePersist = () => {};
    let signalPersist = () => {};
    const persistStarted = new Promise<void>((resolve) => { signalPersist = resolve; });
    const persistGate = new Promise<void>((resolve) => { releasePersist = resolve; });
    const repository = {
      list: async () => [],
      put: async () => {
        putCount += 1;
        if (putCount === 2) {
          signalPersist();
          await persistGate;
        }
      }
    } as any;
    const service = new SecretKeysService({ repository, now: () => now, passwordKdf: weakKdf });
    const key = await service.createKey({ name: "DeepSeek", value: "provider-secret", authorizationPassword: "account-password", nowMs: now });
    const authorization = await service.createRevealAuthorization({ id: key.id, authorizationPassword: "account-password", ttlMs: 1000, nowMs: now });

    const pending = service.revealKeyWithAuthorization({ authorizationId: authorization.authorizationId, id: key.id });
    await persistStarted;
    now = 2001;
    releasePersist();
    await expect(pending).rejects.toThrow("unavailable");
    expect(service.activeRevealAuthorizationCount()).toBe(0);
  });
});

describe("SecretKeysService seal versions and parameters", () => {
  it("reads a version 1 record: the right password reveals it and a wrong one is refused", async () => {
    const record = legacyV1Record({ id: "secret:legacy", value: "legacy-value", password: PASSWORD });
    const store = createMemoryRepository([record]);
    const service = new SecretKeysService({ repository: store.repository, passwordKdf: weakKdf });

    await expect(service.revealKey({ id: record.id, authorizationPassword: "wrong-dummy-password" })).rejects.toThrow("could not be opened");
    expect(store.storedText(record.id)).toBe(JSON.stringify(record));
    await expect(service.revealKey({ id: record.id, authorizationPassword: PASSWORD })).resolves.toMatchObject({ value: "legacy-value" });
  });

  it("stamps the user whose password seals a key on create and rotate", async () => {
    const service = new SecretKeysService({ passwordKdf: weakKdf });
    const key = await service.createKey({ name: "Stamped", value: "one", authorizationPassword: PASSWORD, createdBy: "user.one" });
    expect(serviceRecord(service, key.id)?.sealed).toMatchObject({ version: 2, sealedByUserId: "user.one" });

    await service.rotateKey({ id: key.id, value: "two", authorizationPassword: PASSWORD, actorUserId: "user.two" });
    expect(serviceRecord(service, key.id)?.sealed).toMatchObject({ sealedByUserId: "user.two" });

    await service.rotateKey({ id: key.id, value: "three", authorizationPassword: PASSWORD });
    expect(serviceRecord(service, key.id)?.sealed).not.toHaveProperty("sealedByUserId");
    await expect(service.revealKey({ id: key.id, authorizationPassword: PASSWORD })).resolves.toMatchObject({ value: "three" });
  });

  it("tries at unlock only keys sealed for the unlocking user, unstamped keys, and version 1 keys", async () => {
    const probe = createDeriveProbe();
    const store = createMemoryRepository([legacyV1Record({ id: "secret:legacy", value: "legacy-value", password: PASSWORD })]);
    const service = new SecretKeysService({ repository: store.repository, now: () => 1000, passwordKdf: { derive: probe.derive, testOnlyWeakParameters: WEAK_SCRYPT_PARAMETERS } });
    await service.createKey({ name: "Mine", value: "mine-value", authorizationPassword: PASSWORD, createdBy: "user.one" });
    await service.createKey({ name: "Theirs", value: "theirs-value", authorizationPassword: PASSWORD, createdBy: "user.two" });
    await service.createKey({ name: "Unstamped", value: "unstamped-value", authorizationPassword: PASSWORD });
    const before = probe.count();

    const unlock = await service.unlockSession({ sessionId: "session.one", userId: "user.one", authorizationPassword: PASSWORD, expiresAtMs: 1_000_000 });

    expect(unlock.unlockedKeyCount).toBe(3);
    // Three opens (mine, unstamped, and the version 1 key) plus the version 1 key's re-seal.
    expect(probe.count() - before).toBe(4);
    service.close();
  });

  it("keeps unlocking and claiming a key after a metadata edit", async () => {
    const service = new SecretKeysService({ now: () => 5000, passwordKdf: weakKdf });
    const key = await service.createKey({ name: "Edited", value: "edited-value", authorizationPassword: PASSWORD, createdBy: "user.one", nowMs: 1000 });
    await service.updateKey({ id: key.id, description: "Renamed", nowMs: 2000 });

    const unlock = await service.unlockSession({ sessionId: "session.one", userId: "user.one", authorizationPassword: PASSWORD, expiresAtMs: 1_000_000 });

    expect(unlock.unlockedKeyCount).toBe(1);
    await expect(claimThroughSession(service, "session.one", "user.one", key.id)).resolves.toBe("edited-value");
    await expect(service.revealKey({ id: key.id, authorizationPassword: PASSWORD })).resolves.toMatchObject({ value: "edited-value" });
    service.close();
  });

  it("does not rewrite a version 2 seal already at the write parameters on unlock", async () => {
    const store = createMemoryRepository();
    const service = new SecretKeysService({ repository: store.repository, now: () => 5000, passwordKdf: weakKdf });
    const key = await service.createKey({ name: "Current", value: "current-value", authorizationPassword: PASSWORD, createdBy: "user.one" });
    const before = store.storedText(key.id);
    const puts = store.putCount();

    await expect(service.unlockSession({ sessionId: "session.one", userId: "user.one", authorizationPassword: PASSWORD, expiresAtMs: 1_000_000 })).resolves.toMatchObject({ unlockedKeyCount: 1 });

    expect(store.putCount()).toBe(puts);
    expect(store.storedText(key.id)).toBe(before);
    service.close();
  });

  it("fails closed on tampered kdfParams inside the allowlist, and skips a record outside it without deriving", async () => {
    const derive = vi.fn<DeriveScryptKeyFn>(async (secret, salt, parameters) => createHash("sha256").update(String(parameters.N)).update(salt).update(secret).digest());
    const passwordKdf = { derive, testOnlyWeakParameters: WEAK_SCRYPT_PARAMETERS };
    const store = createMemoryRepository();
    const writer = new SecretKeysService({ repository: store.repository, passwordKdf });
    const key = await writer.createKey({ name: "Tamper target", value: "tamper-value", authorizationPassword: PASSWORD, createdBy: "user.one" });
    const stored = store.stored(key.id)!;
    await expect(new SecretKeysService({ repository: store.repository, passwordKdf }).revealKey({ id: key.id, authorizationPassword: PASSWORD })).resolves.toMatchObject({ value: "tamper-value" });

    store.replace(key.id, { ...stored, sealed: { ...stored.sealed, kdfParams: { N: 2 ** 17, r: 8, p: 1, keyLength: 32 } } });
    derive.mockClear();
    const tampered = new SecretKeysService({ repository: store.repository, passwordKdf });
    await expect(tampered.revealKey({ id: key.id, authorizationPassword: PASSWORD })).rejects.toThrow("could not be opened");
    expect(derive).toHaveBeenCalledTimes(1);
    expect(derive.mock.calls[0]?.[2]).toMatchObject({ N: 2 ** 17 });

    store.replace(key.id, { ...stored, sealed: { ...stored.sealed, kdfParams: { N: 2 ** 30, r: 8, p: 1, keyLength: 32 } } });
    derive.mockClear();
    const outside = new SecretKeysService({ repository: store.repository, now: () => 1000, passwordKdf });
    expect((await outside.snapshot()).keys).toEqual([]);
    await expect(outside.revealKey({ id: key.id, authorizationPassword: PASSWORD })).rejects.toThrow("Unknown secret key");
    await expect(outside.unlockSession({ sessionId: "session.one", userId: "user.one", authorizationPassword: PASSWORD, expiresAtMs: 5000 })).resolves.toMatchObject({ unlockedKeyCount: 0 });
    expect(derive).not.toHaveBeenCalled();
    outside.close();
  });

  it("reads its own weak-parameter records, while a service at the real parameters skips them without deriving", async () => {
    const store = createMemoryRepository();
    const writer = new SecretKeysService({ repository: store.repository, passwordKdf: weakKdf });
    const key = await writer.createKey({ name: "Weak", value: "weak-value", authorizationPassword: PASSWORD });
    await expect(new SecretKeysService({ repository: store.repository, passwordKdf: weakKdf }).revealKey({ id: key.id, authorizationPassword: PASSWORD })).resolves.toMatchObject({ value: "weak-value" });

    const probe = createDeriveProbe();
    const production = new SecretKeysService({ repository: store.repository, passwordKdf: { derive: probe.derive } });
    expect((await production.snapshot()).keys).toEqual([]);
    await expect(production.revealKey({ id: key.id, authorizationPassword: PASSWORD })).rejects.toThrow("Unknown secret key");
    expect(probe.count()).toBe(0);
  });

  it("refuses test-only weak parameters that are not below the current cost", () => {
    expect(() => new SecretKeysService({ passwordKdf: { testOnlyWeakParameters: { N: 2 ** 17, r: 8, p: 1, keyLength: 32 } } })).toThrow(RangeError);
  });

  it("refuses a password reveal authorization whose derived key does not open the key", async () => {
    const service = new SecretKeysService({ now: () => 1000, passwordKdf: weakKdf });
    const key = await service.createKey({ name: "Guarded", value: "guarded-value", authorizationPassword: PASSWORD });

    await expect(service.createRevealAuthorization({ id: key.id, authorizationPassword: "wrong-dummy-password", ttlMs: 1000 })).rejects.toThrow("refused");
    expect(service.activeRevealAuthorizationCount()).toBe(0);
  });

  it("loads the repository once for concurrent first calls", async () => {
    const store = createMemoryRepository([legacyV1Record({ id: "secret:loaded", value: "loaded-value", password: PASSWORD })]);
    const listing = store.holdNextList();
    const service = new SecretKeysService({ repository: store.repository, passwordKdf: weakKdf });

    const first = service.snapshot();
    const second = service.getKeySummary("secret:loaded");
    await listing.started;
    listing.release();

    await expect(first).resolves.toMatchObject({ keys: [{ id: "secret:loaded" }] });
    await expect(second).resolves.toMatchObject({ id: "secret:loaded" });
    expect(store.listCount()).toBe(1);
  });
});

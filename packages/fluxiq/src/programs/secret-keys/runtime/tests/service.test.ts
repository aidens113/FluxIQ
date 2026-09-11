import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SQLiteRepository } from "../../../database-manager/index.ts";
import { SecretKeysService } from "../service.ts";

afterEach(() => vi.useRealTimers());

describe("SecretKeysService", () => {
  it("stores encrypted secret values and returns redacted snapshots", async () => {
    const service = new SecretKeysService();

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

  it("persists sealed payloads without storing plaintext values", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "fluxiq-secrets-"));
    try {
      const repository = new SQLiteRepository({ rootDir: root, kind: SecretKeysService.storeKind });
      const first = new SecretKeysService({ repository });
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
      expect(stored?.data.sealed).toMatchObject({ algorithm: "aes-256-gcm", kdf: "scrypt" });

      const second = new SecretKeysService({ repository: new SQLiteRepository({ rootDir: root, kind: SecretKeysService.storeKind }) });
      await expect(second.revealKey({ id: key.id, authorizationPassword: "admin" })).resolves.toMatchObject({ value: "custom-secret-value" });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("issues opaque one-use reveal authorizations and zeroes derived key material", async () => {
    const service = new SecretKeysService({ now: () => 1000 });
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
    const storedAuthorization = (service as any).revealAuthorizations.get(authorization.authorizationId);
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
    const service = new SecretKeysService({ now: () => now });
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
    const storedUnlock = (service as any).sessionUnlocks.get("session.one");
    expect(storedUnlock).not.toHaveProperty("authorizationPassword");
    const sessionKey = storedUnlock.decryptionKeys.get(key.id).decryptionKey as Buffer;

    const authorization = await service.createSessionRevealAuthorization({
      sessionId: "session.one",
      userId: "user.one",
      id: key.id,
      ttlMs: 1000,
      nowMs: now
    });
    const authorizationKey = (service as any).revealAuthorizations.get(authorization.authorizationId).decryptionKey as Buffer;
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
    const service = new SecretKeysService({ now: () => now });
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
    const service = new SecretKeysService({ now: () => now });
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
    const service = new SecretKeysService({ repository, now: () => now });
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

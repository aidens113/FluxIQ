import { afterEach, describe, expect, it, vi } from "vitest";
import { SECRETS_LOCKED_ERROR_CODE, isSecretsLockedError, secretsLockedMessage } from "@fluxiq/contracts/platform";
import { SecretKeysService } from "../../../../../secret-keys/index.ts";
import { AutomationStudioSecretsLockedError } from "../secrets-locked-error.ts";
import { releaseAutomationStudioSessionDeepSeekKey, type AutomationStudioSessionKeyPorts } from "../session-key.ts";

// Which key a call made for a person uses (H1 selection fix, H0-S5), against
// the real Secret Keys service: weak scrypt, fake key strings, no network.
// Never the newest key of anyone; the Flow's own key when it names one;
// `secrets:UseKey` first; and one typed `secrets.locked` when no unlock of the
// caller holds the key.

const WEAK_KDF = { testOnlyWeakParameters: { N: 2 ** 10, r: 8, p: 1, keyLength: 32 } as const };
const PASSWORD_A = "dummy-password-a";
const PASSWORD_B = "dummy-password-b";

const services: SecretKeysService[] = [];
afterEach(() => {
  for (const service of services.splice(0)) service.close();
});

function secretKeys(): SecretKeysService {
  const service = new SecretKeysService({ passwordKdf: WEAK_KDF });
  services.push(service);
  return service;
}

async function key(service: SecretKeysService, value: string, password: string, nowMs: number, createdBy?: string): Promise<string> {
  const created = await service.createKey({ name: `DeepSeek ${nowMs}`, kind: "llm", provider: "deepseek", value, authorizationPassword: password, nowMs, ...(createdBy ? { createdBy } : {}) });
  return created.id;
}

async function unlock(service: SecretKeysService, sessionId: string, userId: string, password: string): Promise<void> {
  await service.unlockSession({ sessionId, userId, authorizationPassword: password, expiresAtMs: Date.now() + 60_000 });
}

describe("releaseAutomationStudioSessionDeepSeekKey", () => {
  it("releases A's own older key while B's key is the newest (the wrong-key-of-anyone regression)", async () => {
    const service = secretKeys();
    await key(service, "fake-key-A", PASSWORD_A, 100, "user.A");
    await key(service, "fake-key-B", PASSWORD_B, 200, "user.B");
    await unlock(service, "sess.A", "user.A", PASSWORD_A);
    await unlock(service, "sess.B", "user.B", PASSWORD_B);
    expect(await releaseAutomationStudioSessionDeepSeekKey(service, { userId: "user.A", sessionId: "sess.A" })).toBe("fake-key-A");
    expect(await releaseAutomationStudioSessionDeepSeekKey(service, { userId: "user.B", sessionId: "sess.B" })).toBe("fake-key-B");
  });

  it("never tries another person's key: B is offered none of A's", async () => {
    const service = secretKeys();
    await key(service, "fake-key-A", PASSWORD_A, 100, "user.A");
    const attempts: string[] = [];
    const ports: AutomationStudioSessionKeyPorts = {
      snapshot: () => service.snapshot(),
      createSessionRevealAuthorization: async (input) => {
        attempts.push(input.id);
        return await service.createSessionRevealAuthorization(input);
      },
      revealKeyWithAuthorization: (input) => service.revealKeyWithAuthorization(input),
      revokeRevealAuthorization: (id) => service.revokeRevealAuthorization(id)
    };
    await expect(releaseAutomationStudioSessionDeepSeekKey(ports, { userId: "user.B", sessionId: "sess.B" })).rejects.toThrow("There is no enabled DeepSeek key of yours in Secret Keys.");
    expect(attempts).toEqual([]);
  });

  it("uses the Flow's own key when it names one, not the caller's newest", async () => {
    const service = secretKeys();
    const older = await key(service, "fake-key-A-older", PASSWORD_A, 100, "user.A");
    await key(service, "fake-key-A-newer", PASSWORD_A, 200, "user.A");
    await unlock(service, "sess.A", "user.A", PASSWORD_A);
    expect(await releaseAutomationStudioSessionDeepSeekKey(service, { userId: "user.A", sessionId: "sess.A" })).toBe("fake-key-A-newer");
    expect(await releaseAutomationStudioSessionDeepSeekKey(service, { userId: "user.A", sessionId: "sess.A" }, { flowKeyId: older })).toBe("fake-key-A-older");
  });

  it("refuses a Flow key that belongs to someone else, or is missing, in words", async () => {
    const service = secretKeys();
    const keyOfB = await key(service, "fake-key-B", PASSWORD_B, 100, "user.B");
    await key(service, "fake-key-A", PASSWORD_A, 200, "user.A");
    await unlock(service, "sess.A", "user.A", PASSWORD_A);
    await expect(releaseAutomationStudioSessionDeepSeekKey(service, { userId: "user.A", sessionId: "sess.A" }, { flowKeyId: keyOfB })).rejects.toThrow("This Flow's model key belongs to another person, so it cannot pay for your calls.");
    await expect(releaseAutomationStudioSessionDeepSeekKey(service, { userId: "user.A", sessionId: "sess.A" }, { flowKeyId: "secret:missing" })).rejects.toThrow("This Flow's model key is missing or turned off in Secret Keys.");
  });

  it("asks secrets:UseKey first, and releases nothing it refuses", async () => {
    const service = secretKeys();
    const keyId = await key(service, "fake-key-A", PASSWORD_A, 100, "user.A");
    await unlock(service, "sess.A", "user.A", PASSWORD_A);
    const authorizeUseKey = vi.fn(async () => false);
    const reveal = vi.spyOn(service, "createSessionRevealAuthorization");
    const ports = Object.assign(Object.create(service) as SecretKeysService, { authorizeUseKey });
    await expect(releaseAutomationStudioSessionDeepSeekKey(ports, { userId: "user.A", sessionId: "sess.A" })).rejects.toThrow("secrets:UseKey");
    expect(authorizeUseKey).toHaveBeenCalledWith("user.A", keyId);
    expect(reveal).not.toHaveBeenCalled();
    authorizeUseKey.mockResolvedValue(true);
    expect(await releaseAutomationStudioSessionDeepSeekKey(ports, { userId: "user.A", sessionId: "sess.A" })).toBe("fake-key-A");
  });

  it("opens a legacy key with no owner stamp only for an unlock that actually holds it", async () => {
    const service = secretKeys();
    await key(service, "fake-key-legacy", PASSWORD_A, 100);
    await unlock(service, "sess.A", "user.A", PASSWORD_A);
    // B's password does not open A's legacy seal: B's unlock holds no key, whether or not it reports that.
    await unlock(service, "sess.B", "user.B", PASSWORD_B).catch((error: unknown) => error);
    expect(await releaseAutomationStudioSessionDeepSeekKey(service, { userId: "user.A", sessionId: "sess.A" })).toBe("fake-key-legacy");
    await expect(releaseAutomationStudioSessionDeepSeekKey(service, { userId: "user.B", sessionId: "sess.B" })).rejects.toBeInstanceOf(AutomationStudioSecretsLockedError);
  });

  it("falls back to the person's other live unlock when the named session is gone", async () => {
    const service = secretKeys();
    await key(service, "fake-key-A", PASSWORD_A, 100, "user.A");
    await unlock(service, "sess.A1", "user.A", PASSWORD_A);
    await unlock(service, "sess.A2", "user.A", PASSWORD_A);
    service.revokeSessionUnlock("sess.A1", { userId: "user.A", administrator: false });
    expect(await releaseAutomationStudioSessionDeepSeekKey(service, { userId: "user.A", sessionId: "sess.A1" })).toBe("fake-key-A");
    expect(await releaseAutomationStudioSessionDeepSeekKey(service, { userId: "user.A", sessionId: null })).toBe("fake-key-A");
  });

  it("fails with the typed secrets.locked error when no unlock of the caller holds the key", async () => {
    const service = secretKeys();
    await key(service, "fake-key-A", PASSWORD_A, 100, "user.A");
    const failure = await releaseAutomationStudioSessionDeepSeekKey(service, { userId: "user.A", sessionId: "sess.A" }, { instanceHost: "app.example.test" }).catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(AutomationStudioSecretsLockedError);
    expect(isSecretsLockedError(failure)).toBe(true);
    expect(failure).toMatchObject({ code: SECRETS_LOCKED_ERROR_CODE, message: secretsLockedMessage("app.example.test") });
    const defaultHost = await releaseAutomationStudioSessionDeepSeekKey(service, { userId: "user.A", sessionId: "sess.A" }).catch((error: unknown) => error);
    expect(defaultHost).toMatchObject({ message: "Sign in at the FluxIQ panel to unlock your model key" });
    expect(String((defaultHost as Error).message)).not.toContain("Secret key session unlock is unavailable");
  });

  it("never reaches A's unlock from another user's browser in the same workspace", async () => {
    const service = secretKeys();
    await key(service, "fake-key-legacy", PASSWORD_A, 100);
    await unlock(service, "sess.A", "user.A", PASSWORD_A);
    await expect(releaseAutomationStudioSessionDeepSeekKey(service, { userId: "user.B", sessionId: "client-gateway:gw.2" })).rejects.toBeInstanceOf(AutomationStudioSecretsLockedError);
    expect(service.unlockedSessionFor("user.B")).toBeNull();
    expect(await releaseAutomationStudioSessionDeepSeekKey(service, { userId: "user.A", sessionId: "client-gateway:gw.1" })).toBe("fake-key-legacy");
  });
});

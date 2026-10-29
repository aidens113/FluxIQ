import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SecretKeysService } from "../service.ts";
import { WEAK_SCRYPT_PARAMETERS } from "./secret-key-fixtures.ts";

// Who may drop a session's unlock: its own user or an administrator, never
// anyone else who merely names the session id. Ids and the password are dummy
// values.

const weakKdf = { testOnlyWeakParameters: WEAK_SCRYPT_PARAMETERS };
const PASSWORD = "dummy-password";
const NOW = 1000;

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

async function serviceWithUnlock(): Promise<{ service: SecretKeysService; keyId: string }> {
  const service = new SecretKeysService({ now: () => NOW, passwordKdf: weakKdf });
  const key = await service.createKey({ name: "DeepSeek", value: "provider-secret", authorizationPassword: PASSWORD, nowMs: NOW });
  await service.unlockSession({ sessionId: "session.owner", userId: "user.owner", authorizationPassword: PASSWORD, expiresAtMs: 9000, nowMs: NOW });
  return { service, keyId: key.id };
}

describe("SecretKeysService.revokeSessionUnlock", () => {
  it("drops the unlock for its own user", async () => {
    const { service } = await serviceWithUnlock();
    expect(service.revokeSessionUnlock("session.owner", { userId: "user.owner", administrator: false })).toBe(true);
    expect(service.unlockedSessionFor("user.owner")).toBeNull();
    expect(service.revokeSessionUnlock("session.owner", { userId: "user.owner", administrator: false })).toBe(false);
  });

  it("drops another user's unlock for an administrator", async () => {
    const { service } = await serviceWithUnlock();
    expect(service.revokeSessionUnlock("session.owner", { userId: "user.admin", administrator: true })).toBe(true);
    expect(service.activeSessionUnlockCount()).toBe(0);
  });

  it("refuses another user, or a revoke nobody vouches for, and keeps the unlock", async () => {
    const { service } = await serviceWithUnlock();
    expect(() => service.revokeSessionUnlock("session.owner", { userId: "user.other", administrator: false })).toThrow("Only the session's own user or an administrator");
    expect(() => service.revokeSessionUnlock("session.owner", { userId: null, administrator: false })).toThrow("Only the session's own user or an administrator");
    expect(service.unlockedSessionFor("user.owner")).toBe("session.owner");
  });

  it("answers false for a session that holds no unlock", async () => {
    const { service } = await serviceWithUnlock();
    expect(service.revokeSessionUnlock("session.unknown", { userId: "user.other", administrator: false })).toBe(false);
    expect(service.activeSessionUnlockCount()).toBe(1);
  });

  it("keeps the unlock when a reveal is asked for it under another user's id", async () => {
    const { service, keyId } = await serviceWithUnlock();
    await expect(service.createSessionRevealAuthorization({ sessionId: "session.owner", userId: "user.other", id: keyId, nowMs: NOW })).rejects.toThrow("unavailable");
    expect(service.unlockedSessionFor("user.owner")).toBe("session.owner");
  });
});

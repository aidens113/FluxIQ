import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SecretKeysService } from "../service.ts";
import { WEAK_SCRYPT_PARAMETERS } from "./secret-key-fixtures.ts";

const weakKdf = { testOnlyWeakParameters: WEAK_SCRYPT_PARAMETERS };
const PASSWORD = "dummy-password";
const NOW = 1000;

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

async function serviceWithKey(): Promise<SecretKeysService> {
  const service = new SecretKeysService({ now: () => NOW, passwordKdf: weakKdf });
  await service.createKey({ name: "DeepSeek", value: "provider-secret", authorizationPassword: PASSWORD, nowMs: NOW });
  return service;
}

function unlock(service: SecretKeysService, sessionId: string, userId: string, expiresAtMs: number) {
  return service.unlockSession({ sessionId, userId, authorizationPassword: PASSWORD, expiresAtMs, nowMs: NOW });
}

describe("SecretKeysService.unlockedSessionFor", () => {
  it("returns null when the user holds no session", async () => {
    const service = await serviceWithKey();
    expect(service.unlockedSessionFor("user.one")).toBeNull();
    expect(service.unlockedSessionFor("")).toBeNull();
  });

  it("returns the user's one live session", async () => {
    const service = await serviceWithKey();
    await unlock(service, "session.one", "user.one", 5000);
    expect(service.unlockedSessionFor("user.one")).toBe("session.one");
  });

  it("prefers the session with the later expiry", async () => {
    const service = await serviceWithKey();
    await unlock(service, "session.late", "user.one", 9000);
    await unlock(service, "session.early", "user.one", 4000);
    expect(service.unlockedSessionFor("user.one")).toBe("session.late");
  });

  it("skips an unlock that opens no key, even with a later expiry", async () => {
    const service = await serviceWithKey();
    await unlock(service, "session.keyed", "user.one", 4000);
    // A wrong password still holds a session, with no key in it.
    await service.unlockSession({ sessionId: "session.keyless", userId: "user.one", authorizationPassword: "wrong-password", expiresAtMs: 9000, nowMs: NOW }).catch((error: unknown) => error);
    expect(service.unlockedSessionFor("user.one")).toBe("session.keyed");
  });

  it("ignores sessions that have expired at nowMs", async () => {
    const service = await serviceWithKey();
    await unlock(service, "session.early", "user.one", 2000);
    await unlock(service, "session.late", "user.one", 3000);
    expect(service.unlockedSessionFor("user.one", 2500)).toBe("session.late");
    expect(service.unlockedSessionFor("user.one", 3000)).toBeNull();
  });

  it("never returns another user's session", async () => {
    const service = await serviceWithKey();
    await unlock(service, "session.other", "user.two", 9000);
    expect(service.unlockedSessionFor("user.one")).toBeNull();
    await unlock(service, "session.one", "user.one", 4000);
    expect(service.unlockedSessionFor("user.one")).toBe("session.one");
    expect(service.unlockedSessionFor("user.two")).toBe("session.other");
  });

  it("ignores a revoked session and changes no held state", async () => {
    const service = await serviceWithKey();
    await unlock(service, "session.late", "user.one", 9000);
    await unlock(service, "session.early", "user.one", 4000);
    service.revokeSessionUnlock("session.late");
    expect(service.unlockedSessionFor("user.one")).toBe("session.early");
    expect(service.activeSessionUnlockCount()).toBe(1);
    expect(service.activeRevealAuthorizationCount()).toBe(0);
    service.revokeSessionUnlock("session.early");
    expect(service.unlockedSessionFor("user.one")).toBeNull();
  });
});

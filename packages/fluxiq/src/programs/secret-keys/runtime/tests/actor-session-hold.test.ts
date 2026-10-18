// A key a person creates, rotates or edits with their password stays usable in
// their own live sign-in session, without signing in again (install proof C5).

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SecretKeysService } from "../service.ts";
import { WEAK_SCRYPT_PARAMETERS, claimThroughSession, heldSessionKey } from "./secret-key-fixtures.ts";

const weakKdf = { testOnlyWeakParameters: WEAK_SCRYPT_PARAMETERS };
const PASSWORD = "dummy-password";
const OTHER_PASSWORD = "other-dummy-password";
const NOW = 1000;

let now = NOW;

beforeEach(() => {
  vi.useFakeTimers();
  now = NOW;
});
afterEach(() => vi.useRealTimers());

function service(): SecretKeysService {
  return new SecretKeysService({ now: () => now, passwordKdf: weakKdf });
}

/** A sign-in with no keys yet: the unlock holds nothing, as the login route leaves it. */
async function signIn(keys: SecretKeysService, sessionId: string, userId: string, password = PASSWORD, expiresAtMs = 9000) {
  return keys.unlockSession({ sessionId, userId, authorizationPassword: password, expiresAtMs, nowMs: now });
}

function session(sessionId: string, userId: string, expiresAtMs = 9000) {
  return { sessionId, userId, expiresAtMs };
}

describe("a key created in a signed-in session", () => {
  it("is usable in the creator's session at once, without signing in again", async () => {
    const keys = service();
    await expect(signIn(keys, "session.one", "user.one")).resolves.toMatchObject({ unlockedKeyCount: 0 });
    expect(keys.unlockedSessionFor("user.one")).toBeNull();

    const key = await keys.createKey({ name: "DeepSeek", value: "provider-secret", authorizationPassword: PASSWORD, createdBy: "user.one", actorSession: session("session.one", "user.one"), nowMs: now });

    expect(keys.unlockedSessionFor("user.one")).toBe("session.one");
    await expect(claimThroughSession(keys, "session.one", "user.one", key.id)).resolves.toBe("provider-secret");
    keys.close();
  });

  it("unlocks a signed-in session that holds no unlock, bounded by that session's expiry", async () => {
    const keys = service();
    const key = await keys.createKey({ name: "DeepSeek", value: "provider-secret", authorizationPassword: PASSWORD, createdBy: "user.one", actorSession: session("session.one", "user.one", 4000), nowMs: now });

    expect(keys.unlockedSessionFor("user.one")).toBe("session.one");
    await expect(claimThroughSession(keys, "session.one", "user.one", key.id)).resolves.toBe("provider-secret");
    const held = heldSessionKey(keys, "session.one", key.id) as Buffer;
    now = 4000;
    vi.advanceTimersByTime(3000);
    expect(keys.unlockedSessionFor("user.one")).toBeNull();
    expect([...held].every((byte) => byte === 0)).toBe(true);
    keys.close();
  });

  it("joins only the creator's own session, never another user's", async () => {
    const keys = service();
    await signIn(keys, "session.one", "user.one");
    await signIn(keys, "session.two", "user.two", OTHER_PASSWORD);

    // A session that belongs to someone else is not the creator's, whatever the call names.
    const key = await keys.createKey({ name: "DeepSeek", value: "provider-secret", authorizationPassword: PASSWORD, createdBy: "user.one", actorSession: session("session.two", "user.one"), nowMs: now });
    expect(heldSessionKey(keys, "session.two", key.id)).toBeUndefined();
    expect(heldSessionKey(keys, "session.one", key.id)).toBeUndefined();

    // A session the call names for a user other than the creator is ignored.
    const second = await keys.createKey({ name: "Second", value: "second-secret", authorizationPassword: PASSWORD, createdBy: "user.one", actorSession: session("session.two", "user.two"), nowMs: now });
    expect(heldSessionKey(keys, "session.two", second.id)).toBeUndefined();
    expect(keys.unlockedSessionFor("user.two")).toBeNull();
    keys.close();
  });

  it("leaves a session alone when no session is named", async () => {
    const keys = service();
    await signIn(keys, "session.one", "user.one");
    const key = await keys.createKey({ name: "DeepSeek", value: "provider-secret", authorizationPassword: PASSWORD, createdBy: "user.one", nowMs: now });
    expect(heldSessionKey(keys, "session.one", key.id)).toBeUndefined();
    keys.close();
  });
});

describe("a key rotated or edited in a signed-in session", () => {
  it("keeps the rotated value usable in the rotating session and revokes everyone else", async () => {
    const keys = service();
    const key = await keys.createKey({ name: "Shared", value: "first-value", authorizationPassword: PASSWORD, nowMs: now });
    await signIn(keys, "session.one", "user.one");
    await signIn(keys, "session.two", "user.two");
    const otherHeld = heldSessionKey(keys, "session.two", key.id) as Buffer;

    now = 2000;
    await keys.rotateKey({ id: key.id, value: "rotated-value", authorizationPassword: PASSWORD, actorUserId: "user.one", actorSession: session("session.one", "user.one"), nowMs: now });

    await expect(claimThroughSession(keys, "session.one", "user.one", key.id)).resolves.toBe("rotated-value");
    expect(heldSessionKey(keys, "session.two", key.id)).toBeUndefined();
    expect([...otherHeld].every((byte) => byte === 0)).toBe(true);
    keys.close();
  });

  it("keeps an edited key usable in the editing session, and only there", async () => {
    const keys = service();
    const key = await keys.createKey({ name: "Shared", value: "edited-value", authorizationPassword: PASSWORD, nowMs: now });
    await signIn(keys, "session.one", "user.one");
    await signIn(keys, "session.two", "user.two");

    now = 2000;
    await keys.updateKey({ id: key.id, description: "Renamed", actorSession: session("session.one", "user.one"), nowMs: now });

    await expect(claimThroughSession(keys, "session.one", "user.one", key.id)).resolves.toBe("edited-value");
    expect(heldSessionKey(keys, "session.two", key.id)).toBeUndefined();
    keys.close();
  });
});

// A password-sealed key (written before t928) that a person's sign-in holds stays
// usable in their own live session when they edit it, and only there. A key
// saved or replaced since then is opened by host protection for its owner and
// needs no session at all (`host-sealed-keys.test.ts`).

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SecretKeysService } from "../service.ts";
import { WEAK_SCRYPT_PARAMETERS, claimThroughSession, createPasswordSealedKey, heldSessionKey } from "./secret-key-fixtures.ts";

const weakKdf = { testOnlyWeakParameters: WEAK_SCRYPT_PARAMETERS };
const PASSWORD = "dummy-password";
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

async function signIn(keys: SecretKeysService, sessionId: string, userId: string, password = PASSWORD, expiresAtMs = 9000) {
  return keys.unlockSession({ sessionId, userId, authorizationPassword: password, expiresAtMs, nowMs: now });
}

function session(sessionId: string, userId: string, expiresAtMs = 9000) {
  return { sessionId, userId, expiresAtMs };
}

describe("a password-sealed key edited in a signed-in session", () => {
  it("keeps an edited key usable in the editing session, and only there", async () => {
    const keys = service();
    const key = await createPasswordSealedKey(keys, { name: "Shared", value: "edited-value", authorizationPassword: PASSWORD, nowMs: now });
    await signIn(keys, "session.one", "user.one");
    await signIn(keys, "session.two", "user.two");

    now = 2000;
    await keys.updateKey({ id: key.id, description: "Renamed", actorSession: session("session.one", "user.one"), nowMs: now });

    await expect(claimThroughSession(keys, "session.one", "user.one", key.id)).resolves.toBe("edited-value");
    expect(heldSessionKey(keys, "session.two", key.id)).toBeUndefined();
    keys.close();
  });
});

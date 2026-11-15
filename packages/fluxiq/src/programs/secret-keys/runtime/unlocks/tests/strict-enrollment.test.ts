import { afterEach, describe, expect, it, vi } from "vitest";
import { SecretKeysService } from "../../service.ts";
import { secretKeySessionDigest, type SecretKeyLockedCredentialHolder } from "../index.ts";
import { strictEnrollmentFixture } from "./strict-enrollment-fixture.ts";

const services: SecretKeysService[] = [];
afterEach(() => {
  for (const service of services.splice(0)) service.close();
  vi.restoreAllMocks();
});

function fixture() {
  const result = strictEnrollmentFixture();
  services.push(result.service);
  return result;
}

describe("strict locked credential enrollment", () => {
  it("accepts zero keys and persists the exact locked binding without creating a held unlock", async () => {
    const f = fixture();
    await f.service.credentialUnlocks.enrollLockedCredential(f.holder, f.credential);
    expect(f.stored()).toMatchObject({ holderKind: "paired-client", userId: f.holder.userId, approvingSessionDigest: f.holder.approvingSessionDigest, expiresAtMs: f.holder.expiresAtMs, boxes: {}, lockReason: "first_unlock", lockedAtMs: f.clock.now });
    expect(f.service.activeSessionUnlockCount()).toBe(0);
    expect(f.unlocks.storedText(f.holder.holderId)).not.toContain(f.credential);
    expect(f.unlocks.storedText(f.holder.holderId)).not.toContain("synthetic-approving-session");
  });

  it("rejects missing persistence and invalid approval/expiry/holder bindings", async () => {
    const f = fixture();
    const local = new SecretKeysService({ now: () => f.clock.now });
    services.push(local);
    await expect(local.credentialUnlocks.enrollLockedCredential(f.holder, f.credential)).rejects.toThrow("requires a persistence repository");
    await expect(f.service.credentialUnlocks.enrollLockedCredential({ ...f.holder, approvingSessionDigest: "raw-cookie-is-not-a-digest" }, f.credential)).rejects.toThrow("Invalid strict");
    await expect(f.service.credentialUnlocks.enrollLockedCredential({ ...f.holder, expiresAtMs: f.clock.now }, f.credential)).rejects.toThrow("Invalid strict");
    await expect(f.service.credentialUnlocks.enrollLockedCredential({ ...f.holder, holderId: "panel-session:not-a-client" }, f.credential)).rejects.toThrow("Invalid strict");
    expect(f.unlocks.putCount()).toBe(0);
  });

  it.each(["same", "owner", "digest", "expiry", "credential"])("refuses an existing %s binding rather than reusing or overwriting it", async (difference) => {
    const f = fixture();
    await f.service.credentialUnlocks.enrollLockedCredential(f.holder, f.credential);
    const before = f.unlocks.storedText(f.holder.holderId);
    const holder = { ...f.holder };
    if (difference === "owner") holder.userId = "user.someone-else";
    if (difference === "digest") holder.approvingSessionDigest = secretKeySessionDigest("another-session");
    if (difference === "expiry") holder.expiresAtMs += 1;
    await expect(f.service.credentialUnlocks.enrollLockedCredential(holder, difference === "credential" ? "another-credential" : f.credential)).rejects.toThrow("requires a fresh holder");
    expect(f.unlocks.storedText(f.holder.holderId)).toBe(before);
    expect(f.unlocks.putCount()).toBe(1);
    expect(f.service.activeSessionUnlockCount()).toBe(0);
  });

  it("leaves no provisional memory or persistence after a refused write and really writes on retry", async () => {
    const f = fixture();
    vi.spyOn(f.unlocks.repository, "put").mockRejectedValueOnce(new Error("synthetic persistence rejection"));
    await expect(f.service.credentialUnlocks.enrollLockedCredential(f.holder, f.credential)).rejects.toThrow("synthetic persistence rejection");
    expect(f.stored()).toBeUndefined();
    expect(await f.service.credentialUnlocks.lockedClientsFor(f.holder.userId)).toEqual([]);
    expect(f.service.activeSessionUnlockCount()).toBe(0);
    await f.service.credentialUnlocks.enrollLockedCredential(f.holder, f.credential);
    expect(f.stored()).toMatchObject({ boxes: {}, approvingSessionDigest: f.holder.approvingSessionDigest });
    expect(f.unlocks.repository.put).toHaveBeenCalledTimes(2);
  });

  it("compensates a write that committed before reporting failure, then permits a clean retry", async () => {
    const f = fixture();
    const put = f.unlocks.repository.put.bind(f.unlocks.repository);
    vi.spyOn(f.unlocks.repository, "put").mockImplementationOnce(async (record) => {
      await put(record);
      throw new Error("synthetic post-commit rejection");
    });
    await expect(f.service.credentialUnlocks.enrollLockedCredential(f.holder, f.credential)).rejects.toThrow("post-commit rejection");
    expect(f.stored()).toBeUndefined();
    expect(await f.service.credentialUnlocks.lockedClientsFor(f.holder.userId)).toEqual([]);
    await f.service.credentialUnlocks.enrollLockedCredential(f.holder, f.credential);
    expect(f.stored()?.boxes).toEqual({});
  });

  it("cannot publish on retry if both enrollment persistence and compensating removal fail", async () => {
    const f = fixture();
    const put = f.unlocks.repository.put.bind(f.unlocks.repository);
    vi.spyOn(f.unlocks.repository, "put").mockImplementationOnce(async (record) => {
      await put(record);
      throw new Error("synthetic post-commit rejection");
    });
    vi.spyOn(f.unlocks.repository, "delete").mockRejectedValueOnce(new Error("synthetic cleanup rejection"));
    await expect(f.service.credentialUnlocks.enrollLockedCredential(f.holder, f.credential)).rejects.toThrow("provisional persistence could not be removed");
    expect(await f.service.credentialUnlocks.lockedClientsFor(f.holder.userId)).toEqual([]);
    expect(f.service.activeSessionUnlockCount()).toBe(0);
    await expect(f.service.credentialUnlocks.enrollLockedCredential(f.holder, f.credential)).rejects.toThrow("requires a fresh holder");
    expect(f.unlocks.repository.put).toHaveBeenCalledTimes(1);
  });

  it("serializes overlapping same-holder enrollment and never exposes its provisional row", async () => {
    const f = fixture();
    const held = f.unlocks.holdNextPut();
    const first = f.service.credentialUnlocks.enrollLockedCredential(f.holder, f.credential);
    await held.started;
    expect(f.stored()).toBeUndefined();
    expect(await f.service.credentialUnlocks.lockedClientsFor(f.holder.userId)).toEqual([]);
    const second = f.service.credentialUnlocks.enrollLockedCredential(f.holder, f.credential);
    const refused = expect(second).rejects.toThrow("requires a fresh holder");
    held.release();
    await Promise.all([first, refused]);
    expect(f.unlocks.putCount()).toBe(1);
    expect(f.service.activeSessionUnlockCount()).toBe(0);
  });

  it.each(["owner", "digest", "expiry", "credential"])("rejects conflicting pending %s authority without replacing the first enrollment", async (difference) => {
    const f = fixture();
    const held = f.unlocks.holdNextPut();
    const first = f.service.credentialUnlocks.enrollLockedCredential(f.holder, f.credential);
    await held.started;
    const holder = { ...f.holder };
    if (difference === "owner") holder.userId = "user.someone-else";
    if (difference === "digest") holder.approvingSessionDigest = secretKeySessionDigest("another-session");
    if (difference === "expiry") holder.expiresAtMs += 1;
    await expect(f.service.credentialUnlocks.enrollLockedCredential(holder, difference === "credential" ? "another-credential" : f.credential)).rejects.toThrow("conflicts with a pending holder");
    held.release();
    await first;
    expect(f.stored()).toMatchObject({ userId: f.holder.userId, approvingSessionDigest: f.holder.approvingSessionDigest, expiresAtMs: f.holder.expiresAtMs });
    expect(f.unlocks.putCount()).toBe(1);
  });

  it("does not borrow the person's or anyone else's live unlocked keys", async () => {
    const f = fixture();
    for (const userId of [f.holder.userId, "user.someone-else"]) {
      const password = `synthetic-password-${userId}`;
      await f.service.createKey({ name: "Synthetic model key", value: `synthetic-value-${userId}`, authorizationPassword: password, createdBy: userId });
      await f.service.unlockSession({ sessionId: `synthetic-session-${userId}`, userId, authorizationPassword: password, expiresAtMs: f.clock.now + 60_000 });
    }
    const count = f.service.activeSessionUnlockCount();
    await f.service.credentialUnlocks.enrollLockedCredential(f.holder, f.credential);
    expect(f.stored()?.boxes).toEqual({});
    expect(f.service.activeSessionUnlockCount()).toBe(count);
    expect(f.service.holdingSession(f.service.credentialUnlocks.heldHandleFor(f.holder.holderId), f.holder.userId)).toBeNull();
    expect(f.service.unlockedSessionFor(f.holder.userId)).toBe(`synthetic-session-${f.holder.userId}`);
  });
});

describe("strict enrollment versus ending authority", () => {
  it.each(["forget", "lock", "person", "session", "whole-user", "own-signout"])("refuses and removes an enrollment whose %s arrives while persistence waits", async (ending) => {
    const f = fixture();
    const held = f.unlocks.holdNextPut();
    const enrolled = f.service.credentialUnlocks.enrollLockedCredential(f.holder, f.credential);
    const refused = expect(enrolled).rejects.toThrow("authority ended");
    await held.started;
    let ended: Promise<void>;
    if (ending === "forget") ended = f.service.credentialUnlocks.forget(f.holder.holderId);
    else if (ending === "lock") ended = f.service.credentialUnlocks.lock(f.holder.holderId, "administrator");
    else if (ending === "person") ended = f.service.credentialUnlocks.lockPerson(f.holder.userId, "password_reset");
    else if (ending === "whole-user") ended = f.service.credentialUnlocks.sessionEnded({ digest: null, wholeUserId: f.holder.userId, revokerUserId: f.holder.userId, administrator: false });
    else ended = f.service.credentialUnlocks.sessionEnded({ digest: ending === "session" ? f.holder.approvingSessionDigest : secretKeySessionDigest("another-ended-session"), revokerUserId: f.holder.userId, administrator: false, liveSessionDigests: new Set() });
    held.release();
    await Promise.all([refused, ended]);
    expect(f.stored()).toBeUndefined();
    expect(await f.service.credentialUnlocks.lockedClientsFor(f.holder.userId)).toEqual([]);
    expect(f.service.activeSessionUnlockCount()).toBe(0);
  });

  it("keeps a distinct live approving session independent of an unrelated signout", async () => {
    const f = fixture();
    const held = f.unlocks.holdNextPut();
    const enrolled = f.service.credentialUnlocks.enrollLockedCredential(f.holder, f.credential);
    await held.started;
    await f.service.credentialUnlocks.sessionEnded({ digest: secretKeySessionDigest("another-session"), revokerUserId: f.holder.userId, administrator: false, liveSessionDigests: new Set([f.holder.approvingSessionDigest]) });
    held.release();
    await enrolled;
    expect(f.stored()?.approvingSessionDigest).toBe(f.holder.approvingSessionDigest);
  });

  it("rejects an approval digest already ended in this instance", async () => {
    const f = fixture();
    await f.service.credentialUnlocks.sessionEnded({ digest: f.holder.approvingSessionDigest, revokerUserId: f.holder.userId, administrator: false });
    await expect(f.service.credentialUnlocks.enrollLockedCredential(f.holder, f.credential)).rejects.toThrow("authority ended");
    expect(f.unlocks.putCount()).toBe(0);
  });

  it("detaches the supplied binding and refuses expiry while a write is pending", async () => {
    const f = fixture();
    const holder: SecretKeyLockedCredentialHolder = { ...f.holder };
    const held = f.unlocks.holdNextPut();
    const enrolled = f.service.credentialUnlocks.enrollLockedCredential(holder, f.credential);
    const refused = expect(enrolled).rejects.toThrow("authority ended");
    await held.started;
    holder.userId = "user.mutated-by-caller";
    f.clock.now = f.holder.expiresAtMs;
    held.release();
    await refused;
    expect(f.stored()).toBeUndefined();
  });
});

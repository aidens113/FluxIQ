import { setFlagsFromString } from "node:v8";
import { runInNewContext } from "node:vm";
import { afterEach, describe, expect, it, vi } from "vitest";
import { HeldKeys } from "../held-keys.ts";
import { SecretKeysService, type SecretKeysCloseMode } from "../service.ts";
import { claimThroughSession, createDeriveProbe, createMemoryRepository, heldSessionKey, WEAK_SCRYPT_PARAMETERS } from "./secret-key-fixtures.ts";

// Key custody outside the instance: a `SecretKeysService` given a `HeldKeys`
// leaves it alone when evicted, so a workspace manager can drop an idle instance
// and the next one over the same repository releases the same unlocks. A
// service's own `HeldKeys` is always revoked on close, and no expiry timer keeps
// the service, or the input that carried a password, alive. Dummy ids, passwords
// and values only.

const weakKdf = { testOnlyWeakParameters: WEAK_SCRYPT_PARAMETERS };
const PASSWORD = "dummy-password";
const VALUE = "dummy-provider-value";
const USER = "user.owner";
const SESSION = "session.owner";
const NOW = 1000;

afterEach(() => vi.useRealTimers());

function isZeroed(buffer: Buffer): boolean {
  return buffer.every((byte) => byte === 0);
}

async function unlockedService(options: { heldKeys?: HeldKeys; repository?: ReturnType<typeof createMemoryRepository> } = {}) {
  const repository = options.repository ?? createMemoryRepository();
  const service = new SecretKeysService({ repository: repository.repository, now: () => NOW, passwordKdf: weakKdf, ...(options.heldKeys ? { heldKeys: options.heldKeys } : {}) });
  const key = await service.createKey({ name: "Provider", value: VALUE, authorizationPassword: PASSWORD, createdBy: USER, nowMs: NOW });
  await service.unlockSession({ sessionId: SESSION, userId: USER, authorizationPassword: PASSWORD, expiresAtMs: NOW + 60_000, nowMs: NOW });
  const held = heldSessionKey(service, SESSION, key.id);
  if (!held) throw new Error("the unlock holds no key");
  return { service, repository, keyId: key.id, held };
}

describe("SecretKeysService.close and an owned HeldKeys", () => {
  const modes: Array<SecretKeysCloseMode | undefined> = [undefined, "shutdown", "evict"];
  for (const mode of modes) {
    it(`revokes and zeroes every held key on close (${mode ?? "default"})`, async () => {
      const { service, keyId, held } = await unlockedService();
      const authorization = await service.createSessionRevealAuthorization({ sessionId: SESSION, userId: USER, id: keyId, nowMs: NOW });
      service.close(mode === undefined ? undefined : { mode });
      expect(service.activeSessionUnlockCount()).toBe(0);
      expect(service.activeRevealAuthorizationCount()).toBe(0);
      expect(service.unlockedSessionFor(USER)).toBeNull();
      expect(isZeroed(held)).toBe(true);
      await expect(service.revealKeyWithAuthorization({ authorizationId: authorization.authorizationId, id: keyId, nowMs: NOW })).rejects.toThrow("unavailable");
    });
  }
});

describe("SecretKeysService.close and an injected HeldKeys", () => {
  it("leaves the unlocks and reveal authorizations in place on evict", async () => {
    const heldKeys = new HeldKeys();
    const { service, keyId, held } = await unlockedService({ heldKeys });
    await service.createSessionRevealAuthorization({ sessionId: SESSION, userId: USER, id: keyId, nowMs: NOW });
    service.close({ mode: "evict" });
    expect(heldKeys.sessionCount()).toBe(1);
    expect(heldKeys.authorizationCount()).toBe(1);
    expect(isZeroed(held)).toBe(false);
    heldKeys.revokeAll();
  });

  for (const mode of [undefined, "shutdown"] as const) {
    it(`revokes and zeroes them on shutdown (${mode ?? "default"})`, async () => {
      const heldKeys = new HeldKeys();
      const { service, keyId, held } = await unlockedService({ heldKeys });
      await service.createSessionRevealAuthorization({ sessionId: SESSION, userId: USER, id: keyId, nowMs: NOW });
      service.close(mode === undefined ? undefined : { mode });
      expect(heldKeys.sessionCount()).toBe(0);
      expect(heldKeys.authorizationCount()).toBe(0);
      expect(isZeroed(held)).toBe(true);
    });
  }

  it("lets a new service over the same repository release the surviving unlock without a re-unlock", async () => {
    const heldKeys = new HeldKeys();
    const first = await unlockedService({ heldKeys });
    const carried = await first.service.createSessionRevealAuthorization({ sessionId: SESSION, userId: USER, id: first.keyId, nowMs: NOW });
    first.service.close({ mode: "evict" });

    const probe = createDeriveProbe();
    const second = new SecretKeysService({ repository: first.repository.repository, now: () => NOW, passwordKdf: { ...weakKdf, derive: probe.derive }, heldKeys });
    expect(second.unlockedSessionFor(USER)).toBe(SESSION);
    expect(second.activeSessionUnlockCount()).toBe(1);
    await expect(claimThroughSession(second, SESSION, USER, first.keyId)).resolves.toBe(VALUE);
    // A reveal authorization drawn before the eviction is claimed through the new service too.
    await expect(second.revealKeyWithAuthorization({ authorizationId: carried.authorizationId, id: first.keyId, nowMs: NOW })).resolves.toMatchObject({ value: VALUE });
    expect(probe.count()).toBe(0);
    expect(heldSessionKey(second, SESSION, first.keyId)).toBe(first.held);
    second.close();
    expect(isZeroed(first.held)).toBe(true);
  });

  it("revokes the surviving unlock's key when the new service rotates it", async () => {
    const heldKeys = new HeldKeys();
    const first = await unlockedService({ heldKeys });
    first.service.close({ mode: "evict" });
    const second = new SecretKeysService({ repository: first.repository.repository, now: () => NOW, passwordKdf: weakKdf, heldKeys });
    expect(second.unlockedSessionFor(USER)).toBe(SESSION);
    await second.rotateKey({ id: first.keyId, value: "dummy-next-value", authorizationPassword: PASSWORD, actorUserId: USER, nowMs: NOW + 10 });
    expect(isZeroed(first.held)).toBe(true);
    expect(second.unlockedSessionFor(USER)).toBeNull();
    second.close();
  });

  it("still expires the unlock and its authorizations after the creating service is evicted", async () => {
    vi.useFakeTimers();
    const heldKeys = new HeldKeys();
    const { service, keyId, held } = await unlockedService({ heldKeys });
    await service.createSessionRevealAuthorization({ sessionId: SESSION, userId: USER, id: keyId, ttlMs: 1000, nowMs: NOW });
    service.close({ mode: "evict" });
    await vi.advanceTimersByTimeAsync(1000);
    expect(heldKeys.authorizationCount()).toBe(0);
    expect(heldKeys.sessionCount()).toBe(1);
    await vi.advanceTimersByTimeAsync(59_000);
    expect(heldKeys.sessionCount()).toBe(0);
    expect(isZeroed(held)).toBe(true);
  });
});

describe("expiry timers", () => {
  setFlagsFromString("--expose-gc");
  const gc = runInNewContext("gc") as () => void;

  /** Collects until every reference clears or ten rounds pass; a WeakRef target survives the job that created it, so each round yields first. */
  async function collected(references: Array<WeakRef<object>>): Promise<boolean> {
    for (let round = 0; round < 10; round += 1) {
      await new Promise((resolve) => setImmediate(resolve));
      gc();
      if (references.every((reference) => reference.deref() === undefined)) return true;
    }
    return false;
  }

  /** Unlocks a session and draws both kinds of reveal authorization, keeping only weak references to the service and to each input that carried a password. */
  async function unlockAndDrop(heldKeys: HeldKeys | undefined, mode: SecretKeysCloseMode | "none"): Promise<Array<WeakRef<object>>> {
    const service = new SecretKeysService({ now: () => Date.now(), passwordKdf: weakKdf, ...(heldKeys ? { heldKeys } : {}) });
    const key = await service.createKey({ name: "Provider", value: VALUE, authorizationPassword: PASSWORD, createdBy: USER });
    const unlockInput = { sessionId: SESSION, userId: USER, authorizationPassword: PASSWORD, expiresAtMs: Date.now() + 12 * 60 * 60 * 1000 };
    await service.unlockSession(unlockInput);
    const revealInput = { id: key.id, authorizationPassword: PASSWORD, ttlMs: 300_000 };
    await service.createRevealAuthorization(revealInput);
    await service.createSessionRevealAuthorization({ sessionId: SESSION, userId: USER, id: key.id, ttlMs: 300_000 });
    if (mode !== "none") service.close({ mode });
    return [new WeakRef(service), new WeakRef(unlockInput), new WeakRef(revealInput)];
  }

  it("do not keep the service or a password-carrying input alive while they are pending", async () => {
    const heldKeys = new HeldKeys();
    const references = await unlockAndDrop(heldKeys, "evict");
    expect(heldKeys.sessionCount()).toBe(1);
    expect(heldKeys.authorizationCount()).toBe(2);
    expect(await collected(references)).toBe(true);
    // The timers are still pending: the custody outlived its service.
    expect(heldKeys.sessionCount()).toBe(1);
    heldKeys.revokeAll();
  });

  it("do not keep a password-carrying input alive for a service that owns its keys and is never closed", async () => {
    const references = await unlockAndDrop(undefined, "none");
    expect(await collected(references.slice(1))).toBe(true);
  });
});

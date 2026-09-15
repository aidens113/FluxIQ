// The Secret Keys side of an Identity Access credential change, driven by a
// fake caller in the port's order: prepare, write the credential, then commit,
// or abort when the write fails. Prepare writes the re-sealed copies ahead as
// pending seals, so a failure at any step leaves a password that opens each key.

import { afterEach, describe, expect, it, vi } from "vitest";
import { deriveScryptKey, type DeriveScryptKeyFn } from "../../../_shared/password-kdf/index.ts";
import type { Repository } from "../../../database-manager/index.ts";
import { SecretKeysService } from "../service.ts";
import {
  WEAK_SCRYPT_PARAMETERS,
  claimThroughSession,
  createMemoryRepository,
  heldSessionKey,
  legacyV1Record,
  serviceRecord,
  waitUntil,
  type MemoryRepository
} from "./secret-key-fixtures.ts";

const CURRENT = "dummy-current-password";
const NEXT = "dummy-next-password";
const weakKdf = { testOnlyWeakParameters: WEAK_SCRYPT_PARAMETERS };
const changeForUserOne = { userId: "user.one", currentPassword: CURRENT, nextPassword: NEXT };

afterEach(() => vi.useRealTimers());

function serviceOver(repository: Repository): SecretKeysService {
  return new SecretKeysService({ repository, now: () => 5000, passwordKdf: weakKdf });
}

function reader(store: MemoryRepository): SecretKeysService {
  return serviceOver(store.repository);
}

function unlockUserOne(service: SecretKeysService, password: string) {
  return service.unlockSession({ sessionId: "session.one", userId: "user.one", authorizationPassword: password, expiresAtMs: 1_000_000 });
}

/** A repository whose writes fail while `failing()` is true. */
function failingWrites(store: MemoryRepository, failing: () => boolean): Repository {
  return {
    ...store.repository,
    put: async (record) => {
      if (failing()) throw new Error("dummy write failure");
      return store.repository.put(record);
    }
  };
}

type PendingChanges = Map<string, { seals: Array<{ key: Buffer }> }>;

function pendingChanges(service: SecretKeysService): PendingChanges {
  return (service as unknown as { credentialChanges: { pending: PendingChanges } }).credentialChanges.pending;
}

function preparedKeys(service: SecretKeysService, changeId: string): Buffer[] {
  return pendingChanges(service).get(changeId)?.seals.map((seal) => seal.key) ?? [];
}

function pendingChangeCount(service: SecretKeysService): number {
  return pendingChanges(service).size;
}

function zeroed(buffer: Buffer | undefined): boolean {
  return buffer !== undefined && buffer.every((byte) => byte === 0);
}

describe("SecretKeysService credential change", () => {
  it("writes each re-sealed copy beside the current seal at prepare, and promotes it at commit", async () => {
    const store = createMemoryRepository([legacyV1Record({ id: "secret:legacy", value: "legacy-value", password: CURRENT })]);
    const service = reader(store);
    const own = await service.createKey({ name: "Own", value: "own-value", authorizationPassword: CURRENT, createdBy: "user.one" });
    const other = await service.createKey({ name: "Other", value: "other-value", authorizationPassword: CURRENT, createdBy: "user.two" });
    const otherText = store.storedText(other.id);
    const ownSealed = store.stored(own.id)?.sealed;

    const change = await service.prepareCredentialChange(changeForUserOne);

    expect(change.resealedKeyCount).toBe(2);
    expect(store.stored(own.id)?.sealed).toEqual(ownSealed);
    expect(store.stored(own.id)?.pendingSealed).toMatchObject({ version: 2, sealedByUserId: "user.one" });
    expect(store.stored("secret:legacy")?.sealed.version).toBe(1);
    expect(store.stored("secret:legacy")?.pendingSealed).toMatchObject({ version: 2, sealedByUserId: "user.one" });
    expect(store.storedText(other.id)).toBe(otherText);

    // The caller writes the new credential here, then commits.
    await expect(service.commitCredentialChange(change.changeId)).resolves.toEqual({ changeId: change.changeId, resealedKeyCount: 2 });

    expect(store.stored(own.id)?.sealed).toMatchObject({ version: 2, sealedByUserId: "user.one" });
    expect(store.stored(own.id)).not.toHaveProperty("pendingSealed");
    expect(store.stored("secret:legacy")?.sealed).toMatchObject({ version: 2, sealedByUserId: "user.one" });
    expect(store.stored("secret:legacy")).not.toHaveProperty("pendingSealed");
    expect(store.storedText(other.id)).toBe(otherText);
    expect(pendingChangeCount(service)).toBe(0);
    await expect(reader(store).revealKey({ id: own.id, authorizationPassword: NEXT })).resolves.toMatchObject({ value: "own-value" });
    await expect(reader(store).revealKey({ id: "secret:legacy", authorizationPassword: NEXT })).resolves.toMatchObject({ value: "legacy-value" });
    await expect(reader(store).revealKey({ id: own.id, authorizationPassword: CURRENT })).rejects.toThrow("could not be opened");
    await expect(reader(store).revealKey({ id: other.id, authorizationPassword: CURRENT })).resolves.toMatchObject({ value: "other-value" });
  });

  it("lets the new password unlock and reveal a key when the commit fails after the credential write", async () => {
    const store = createMemoryRepository([legacyV1Record({ id: "secret:legacy", value: "legacy-value", password: CURRENT })]);
    let failWrites = false;
    const service = serviceOver(failingWrites(store, () => failWrites));
    const own = await service.createKey({ name: "Own", value: "own-value", authorizationPassword: CURRENT, createdBy: "user.one" });
    const change = await service.prepareCredentialChange(changeForUserOne);

    // The caller has written the new credential; the commit's own write fails.
    failWrites = true;
    await expect(service.commitCredentialChange(change.changeId)).rejects.toThrow("dummy write failure");
    failWrites = false;
    await expect(service.revealKey({ id: "secret:legacy", authorizationPassword: NEXT })).resolves.toMatchObject({ value: "legacy-value" });

    // After a restart the store still holds the old seal as current and the new one as pending.
    expect(store.stored(own.id)?.pendingSealed).toBeDefined();
    const restarted = reader(store);
    await expect(unlockUserOne(restarted, NEXT)).resolves.toMatchObject({ unlockedKeyCount: 2 });
    await expect(claimThroughSession(restarted, "session.one", "user.one", own.id)).resolves.toBe("own-value");
    await expect(restarted.revealKey({ id: own.id, authorizationPassword: NEXT })).resolves.toMatchObject({ value: "own-value" });
    expect(store.stored(own.id)?.sealed).toMatchObject({ version: 2, sealedByUserId: "user.one" });
    expect(store.stored(own.id)).not.toHaveProperty("pendingSealed");
    await expect(reader(store).revealKey({ id: own.id, authorizationPassword: CURRENT })).rejects.toThrow("could not be opened");
    restarted.close();
  });

  it("leaves the old password working when the credential write fails after prepare, even if abort never runs", async () => {
    const store = createMemoryRepository();
    const service = reader(store);
    const key = await service.createKey({ name: "Own", value: "own-value", authorizationPassword: CURRENT, createdBy: "user.one" });
    await service.prepareCredentialChange(changeForUserOne);
    // The credential write fails and the process stops before it can abort.
    service.close();

    const restarted = reader(store);
    await expect(unlockUserOne(restarted, CURRENT)).resolves.toMatchObject({ unlockedKeyCount: 1 });
    await expect(claimThroughSession(restarted, "session.one", "user.one", key.id)).resolves.toBe("own-value");
    await expect(restarted.revealKey({ id: key.id, authorizationPassword: CURRENT })).resolves.toMatchObject({ value: "own-value" });
    expect(store.stored(key.id)).not.toHaveProperty("pendingSealed");
    await expect(reader(store).revealKey({ id: key.id, authorizationPassword: NEXT })).rejects.toThrow("could not be opened");
    restarted.close();
  });

  it("aborting removes the pending seals, zeroes the prepared keys, and leaves the old seal working", async () => {
    const store = createMemoryRepository();
    const service = reader(store);
    const key = await service.createKey({ name: "Own", value: "own-value", authorizationPassword: CURRENT, createdBy: "user.one" });
    const sealed = store.stored(key.id)?.sealed;

    const change = await service.prepareCredentialChange(changeForUserOne);
    const prepared = preparedKeys(service, change.changeId);
    expect(prepared).toHaveLength(1);
    expect(store.stored(key.id)?.pendingSealed).toBeDefined();
    service.abortCredentialChange(change.changeId);

    await waitUntil(() => store.stored(key.id)?.pendingSealed === undefined);
    expect(prepared.every(zeroed)).toBe(true);
    expect(store.stored(key.id)?.sealed).toEqual(sealed);
    await expect(service.commitCredentialChange(change.changeId)).rejects.toThrow("unavailable");
    await expect(reader(store).revealKey({ id: key.id, authorizationPassword: CURRENT })).resolves.toMatchObject({ value: "own-value" });
    await expect(reader(store).revealKey({ id: key.id, authorizationPassword: NEXT })).rejects.toThrow("could not be opened");
  });

  it("keeps the user's session keys and revokes every other holder at commit", async () => {
    const service = new SecretKeysService({ now: () => 5000, passwordKdf: weakKdf });
    const shared = await service.createKey({ name: "Unstamped", value: "shared-value", authorizationPassword: CURRENT });
    await service.unlockSession({ sessionId: "session.one", userId: "user.one", authorizationPassword: CURRENT, expiresAtMs: 1_000_000 });
    await service.unlockSession({ sessionId: "session.two", userId: "user.two", authorizationPassword: CURRENT, expiresAtMs: 1_000_000 });
    const heldByOne = heldSessionKey(service, "session.one", shared.id);
    const heldByTwo = heldSessionKey(service, "session.two", shared.id);
    const outstanding = await service.createRevealAuthorization({ id: shared.id, authorizationPassword: CURRENT, ttlMs: 60_000 });

    const change = await service.prepareCredentialChange(changeForUserOne);
    await service.commitCredentialChange(change.changeId);

    expect(zeroed(heldByOne)).toBe(true);
    expect(zeroed(heldByTwo)).toBe(true);
    expect(heldSessionKey(service, "session.two", shared.id)).toBeUndefined();
    expect(service.activeRevealAuthorizationCount()).toBe(0);
    await expect(service.revealKeyWithAuthorization({ authorizationId: outstanding.authorizationId, id: shared.id })).rejects.toThrow("unavailable");
    await expect(claimThroughSession(service, "session.one", "user.one", shared.id)).resolves.toBe("shared-value");
    service.close();
  });

  it("keeps a rotation that lands between prepare and commit, and drops the stale pending seal", async () => {
    const service = new SecretKeysService({ passwordKdf: weakKdf });
    const key = await service.createKey({ name: "Own", value: "own-value", authorizationPassword: CURRENT, createdBy: "user.one", nowMs: 1000 });
    const change = await service.prepareCredentialChange(changeForUserOne);

    await service.rotateKey({ id: key.id, value: "rotated-value", authorizationPassword: CURRENT, actorUserId: "user.one", nowMs: 2000 });

    expect(serviceRecord(service, key.id)?.pendingSealed).toBeUndefined();
    await expect(service.commitCredentialChange(change.changeId)).resolves.toMatchObject({ resealedKeyCount: 0 });
    await expect(service.revealKey({ id: key.id, authorizationPassword: CURRENT })).resolves.toMatchObject({ value: "rotated-value" });
  });

  it("keeps the pending seal of a change still in flight when the old password unlocks, and commits over the upgrade", async () => {
    const store = createMemoryRepository([legacyV1Record({ id: "secret:legacy", value: "legacy-value", password: CURRENT })]);
    const service = reader(store);
    const change = await service.prepareCredentialChange(changeForUserOne);

    await unlockUserOne(service, CURRENT);
    expect(serviceRecord(service, "secret:legacy")?.sealed.version).toBe(2);
    expect(store.stored("secret:legacy")?.pendingSealed).toBeDefined();

    await expect(service.commitCredentialChange(change.changeId)).resolves.toMatchObject({ resealedKeyCount: 1 });
    await expect(reader(store).revealKey({ id: "secret:legacy", authorizationPassword: NEXT })).resolves.toMatchObject({ value: "legacy-value" });
    await expect(claimThroughSession(service, "session.one", "user.one", "secret:legacy")).resolves.toBe("legacy-value");
    service.close();
  });

  it("refuses the change, leaving no pending seal and holding nothing, when a derivation fails", async () => {
    const nextKeys: Buffer[] = [];
    let nextDerivations = 0;
    const derive: DeriveScryptKeyFn = async (secret, salt, parameters, options) => {
      if (secret !== NEXT) return deriveScryptKey(secret, salt, parameters, options);
      nextDerivations += 1;
      if (nextDerivations === 2) throw new Error("dummy derivation failure");
      const key = await deriveScryptKey(secret, salt, parameters, options);
      nextKeys.push(key);
      return key;
    };
    const service = new SecretKeysService({ passwordKdf: { derive, testOnlyWeakParameters: WEAK_SCRYPT_PARAMETERS } });
    const first = await service.createKey({ name: "First", value: "first-value", authorizationPassword: CURRENT, createdBy: "user.one" });
    const second = await service.createKey({ name: "Second", value: "second-value", authorizationPassword: CURRENT, createdBy: "user.one" });
    const sealed = serviceRecord(service, first.id)?.sealed;

    await expect(service.prepareCredentialChange(changeForUserOne)).rejects.toThrow("dummy derivation failure");

    expect(pendingChangeCount(service)).toBe(0);
    expect(nextKeys).toHaveLength(1);
    expect(zeroed(nextKeys[0])).toBe(true);
    expect(serviceRecord(service, first.id)?.sealed).toBe(sealed);
    expect(serviceRecord(service, first.id)?.pendingSealed).toBeUndefined();
    expect(serviceRecord(service, second.id)?.pendingSealed).toBeUndefined();
  });

  it("refuses the change and removes its pending seals when writing them fails", async () => {
    const store = createMemoryRepository();
    let failWrites = false;
    const service = serviceOver(failingWrites(store, () => failWrites));
    const key = await service.createKey({ name: "Own", value: "own-value", authorizationPassword: CURRENT, createdBy: "user.one" });

    failWrites = true;
    await expect(service.prepareCredentialChange(changeForUserOne)).rejects.toThrow("dummy write failure");
    failWrites = false;

    expect(pendingChangeCount(service)).toBe(0);
    expect(serviceRecord(service, key.id)?.pendingSealed).toBeUndefined();
    await expect(service.revealKey({ id: key.id, authorizationPassword: CURRENT })).resolves.toMatchObject({ value: "own-value" });
  });

  it("forgets a change left unsettled past its time limit, leaving its pending seal for the next unlock", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const store = createMemoryRepository();
    const service = reader(store);
    const key = await service.createKey({ name: "Own", value: "own-value", authorizationPassword: CURRENT, createdBy: "user.one" });
    const change = await service.prepareCredentialChange(changeForUserOne);
    const prepared = preparedKeys(service, change.changeId);

    await vi.advanceTimersByTimeAsync(60_000);

    expect(pendingChangeCount(service)).toBe(0);
    expect(prepared.every(zeroed)).toBe(true);
    await expect(service.commitCredentialChange(change.changeId)).rejects.toThrow("unavailable");
    expect(store.stored(key.id)?.pendingSealed).toBeDefined();
    // The old password still opens the key, and settles the pending seal the forgotten change left behind.
    await expect(unlockUserOne(service, CURRENT)).resolves.toMatchObject({ unlockedKeyCount: 1 });
    expect(store.stored(key.id)).not.toHaveProperty("pendingSealed");
    service.close();
  });

  it("rejects a change without a user or both passwords", async () => {
    const service = new SecretKeysService({ passwordKdf: weakKdf });
    await expect(service.prepareCredentialChange({ ...changeForUserOne, userId: "" })).rejects.toThrow("invalid");
    await expect(service.prepareCredentialChange({ ...changeForUserOne, nextPassword: "" })).rejects.toThrow("invalid");
  });
});

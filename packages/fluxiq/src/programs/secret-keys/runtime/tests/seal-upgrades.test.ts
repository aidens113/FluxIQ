// Upgrading older seals: a version 1 key is re-sealed as version 2 at its next
// successful unlock or reveal, once, without changing its value or timestamps,
// and without losing a rotation, a deletion, or a held key that races it.

import { describe, expect, it } from "vitest";
import { LEGACY_V1_SCRYPT_PARAMETERS, decodeKdfSalt } from "../../../_shared/password-kdf/index.ts";
import type { SecretKeyRecord } from "../../types.ts";
import { SecretKeysService } from "../service.ts";
import {
  WEAK_SCRYPT_PARAMETERS,
  claimThroughSession,
  createDeriveProbe,
  createMemoryRepository,
  heldSessionKey,
  legacyV1Record,
  serviceRecord,
  waitUntil,
  type MemoryRepository
} from "./secret-key-fixtures.ts";

const PASSWORD = "dummy-password";
const NOW = 5000;
const WEAK_N = WEAK_SCRYPT_PARAMETERS.N;
const weakKdf = { testOnlyWeakParameters: WEAK_SCRYPT_PARAMETERS };

function legacyKey(createdBy?: string): SecretKeyRecord {
  return legacyV1Record({ id: "secret:legacy", value: "legacy-value", password: PASSWORD, atMs: 1000, ...(createdBy ? { createdBy } : {}) });
}

function harness(records: SecretKeyRecord[]) {
  const store = createMemoryRepository(records);
  const probe = createDeriveProbe();
  const service = new SecretKeysService({ repository: store.repository, now: () => NOW, passwordKdf: { derive: probe.derive, testOnlyWeakParameters: WEAK_SCRYPT_PARAMETERS } });
  return { store, probe, service };
}

function unlock(service: SecretKeysService, sessionId: string, password = PASSWORD) {
  return service.unlockSession({ sessionId, userId: "user.one", authorizationPassword: password, expiresAtMs: 1_000_000 });
}

function revealFromStore(store: MemoryRepository, id: string) {
  return new SecretKeysService({ repository: store.repository, passwordKdf: weakKdf }).revealKey({ id, authorizationPassword: PASSWORD });
}

describe("SecretKeysService seal upgrade", () => {
  it("re-seals a version 1 key at unlock without changing its value or timestamps, stamped for the unlocking user", async () => {
    const record = legacyKey("user.two");
    const { store, probe, service } = harness([record]);

    await expect(unlock(service, "session.one")).resolves.toMatchObject({ unlockedKeyCount: 1 });

    const stored = store.stored(record.id)!;
    expect(stored.sealed).toMatchObject({ version: 2, kdfParams: { N: WEAK_N, r: 8, p: 1, keyLength: 32 }, sealedByUserId: "user.one" });
    expect(stored.sealed.salt).not.toBe(record.sealed.salt);
    expect(decodeKdfSalt(stored.sealed.salt)?.length).toBe(16);
    expect(stored).toMatchObject({ updatedAtMs: 1000, lastRotatedAtMs: 1000 });
    expect(store.putCount()).toBe(1);
    expect(probe.count(LEGACY_V1_SCRYPT_PARAMETERS.N)).toBe(1);
    await expect(claimThroughSession(service, "session.one", "user.one", record.id)).resolves.toBe("legacy-value");
    await expect(revealFromStore(store, record.id)).resolves.toMatchObject({ value: "legacy-value" });
    service.close();
  });

  it("leaves a version 1 key byte-for-byte unchanged after a wrong-password unlock", async () => {
    const record = legacyKey();
    const { store, service } = harness([record]);
    const before = store.storedText(record.id);

    await expect(unlock(service, "session.wrong", "wrong-dummy-password")).resolves.toMatchObject({ unlockedKeyCount: 0 });

    expect(store.putCount()).toBe(0);
    expect(store.storedText(record.id)).toBe(before);
    service.close();
  });

  it("neither unlocks nor re-seals a version 1 key carrying another key's seal", async () => {
    const donor = legacyV1Record({ id: "secret:donor", value: "donor-value", password: PASSWORD, atMs: 1000 });
    const target: SecretKeyRecord = { ...legacyKey(), sealed: donor.sealed };
    const { store, service } = harness([target]);
    const before = store.storedText(target.id);

    await expect(unlock(service, "session.one")).resolves.toMatchObject({ unlockedKeyCount: 0 });

    expect(store.putCount()).toBe(0);
    expect(store.storedText(target.id)).toBe(before);
    service.close();
  });

  it("re-seals a version 1 key when it is revealed with its password", async () => {
    const record = legacyKey();
    const { store, service } = harness([record]);

    await expect(service.revealKey({ id: record.id, authorizationPassword: PASSWORD, actorUserId: "user.one" })).resolves.toMatchObject({ value: "legacy-value" });

    expect(store.stored(record.id)?.sealed).toMatchObject({ version: 2, kdfParams: { N: WEAK_N }, sealedByUserId: "user.one" });
    expect(store.stored(record.id)).toMatchObject({ updatedAtMs: 1000, lastRotatedAtMs: 1000 });
    await expect(revealFromStore(store, record.id)).resolves.toMatchObject({ value: "legacy-value" });
  });

  it("shares one re-seal between concurrent unlocks of the same version 1 key", async () => {
    const record = legacyKey();
    const { store, probe, service } = harness([record]);
    const sealing = probe.holdNext(WEAK_N);

    const both = Promise.all([unlock(service, "session.one"), unlock(service, "session.two")]);
    await sealing.started;
    // Both unlocks verify their own copy of the version 1 key before the upgrade lands.
    await waitUntil(() => heldSessionKey(service, "session.one", record.id) !== undefined && heldSessionKey(service, "session.two", record.id) !== undefined);
    sealing.release();

    const [first, second] = await both;
    expect(first.unlockedKeyCount).toBe(1);
    expect(second.unlockedKeyCount).toBe(1);
    expect(store.putCount()).toBe(1);
    expect(probe.count(WEAK_N)).toBe(1);
    await expect(claimThroughSession(service, "session.one", "user.one", record.id)).resolves.toBe("legacy-value");
    await expect(claimThroughSession(service, "session.two", "user.one", record.id)).resolves.toBe("legacy-value");
    service.close();
  });

  it("keeps an outstanding password reveal authorization usable after another session re-seals the key", async () => {
    const record = legacyKey();
    const { service } = harness([record]);
    const authorization = await service.createRevealAuthorization({ id: record.id, authorizationPassword: PASSWORD, ttlMs: 60_000 });

    await unlock(service, "session.one");

    expect(serviceRecord(service, record.id)?.sealed.version).toBe(2);
    await expect(service.revealKeyWithAuthorization({ authorizationId: authorization.authorizationId, id: record.id })).resolves.toMatchObject({ value: "legacy-value" });
    service.close();
  });

  it("does not resurrect a key deleted while its re-seal is being derived", async () => {
    const record = legacyKey();
    const { store, probe, service } = harness([record]);
    const sealing = probe.holdNext(WEAK_N);

    const unlocking = unlock(service, "session.one");
    await sealing.started;
    await expect(service.deleteKey(record.id)).resolves.toBe(true);
    sealing.release();
    await unlocking;

    expect(serviceRecord(service, record.id)).toBeUndefined();
    expect((await service.snapshot()).keys).toEqual([]);
    expect(store.stored(record.id)).toBeUndefined();
    service.close();
  });

  it("does not resurrect a key deleted while its re-seal is being written", async () => {
    const record = legacyKey();
    const { store, service } = harness([record]);
    const writing = store.holdNextPut();

    const unlocking = unlock(service, "session.one");
    await writing.started;
    const deleting = service.deleteKey(record.id);
    await waitUntil(() => serviceRecord(service, record.id) === undefined);
    writing.release();
    await expect(deleting).resolves.toBe(true);
    await unlocking;

    expect(serviceRecord(service, record.id)).toBeUndefined();
    expect(store.stored(record.id)).toBeUndefined();
    service.close();
  });

  it("keeps a rotation that lands while a re-seal is being derived", async () => {
    const record = legacyKey();
    const { store, probe, service } = harness([record]);
    const sealing = probe.holdNext(WEAK_N);

    const unlocking = unlock(service, "session.one");
    await sealing.started;
    await service.rotateKey({ id: record.id, value: "rotated-value", authorizationPassword: PASSWORD, actorUserId: "user.one", nowMs: 2000 });
    const rotated = serviceRecord(service, record.id)?.sealed;
    sealing.release();
    await unlocking;

    expect(serviceRecord(service, record.id)?.sealed).toBe(rotated);
    expect(store.stored(record.id)?.sealed).toEqual(rotated);
    await expect(revealFromStore(store, record.id)).resolves.toMatchObject({ value: "rotated-value" });
    service.close();
  });

  it("keeps a rotation that lands while a re-seal is being written", async () => {
    const record = legacyKey();
    const { store, service } = harness([record]);
    const writing = store.holdNextPut();

    const unlocking = unlock(service, "session.one");
    await writing.started;
    const rotating = service.rotateKey({ id: record.id, value: "rotated-value", authorizationPassword: PASSWORD, actorUserId: "user.one", nowMs: 2000 });
    await waitUntil(() => serviceRecord(service, record.id)?.lastRotatedAtMs === 2000);
    writing.release();
    await rotating;
    await unlocking;

    expect(store.stored(record.id)?.sealed).toEqual(serviceRecord(service, record.id)?.sealed);
    await expect(revealFromStore(store, record.id)).resolves.toMatchObject({ value: "rotated-value" });
    service.close();
  });

  it("never rewrites a seal stronger than its write parameters", async () => {
    const store = createMemoryRepository();
    const production = new SecretKeysService({ repository: store.repository });
    const key = await production.createKey({ name: "Strong", value: "strong-value", authorizationPassword: PASSWORD, createdBy: "user.one" });
    const sealed = store.stored(key.id)?.sealed;
    expect(sealed).toMatchObject({ version: 2, kdfParams: { N: 2 ** 17 } });
    const puts = store.putCount();
    const weak = new SecretKeysService({ repository: store.repository, now: () => NOW, passwordKdf: weakKdf });

    await expect(unlock(weak, "session.one")).resolves.toMatchObject({ unlockedKeyCount: 1 });
    expect(store.putCount()).toBe(puts);

    await expect(weak.revealKey({ id: key.id, authorizationPassword: PASSWORD, actorUserId: "user.one" })).resolves.toMatchObject({ value: "strong-value" });
    expect(store.stored(key.id)?.sealed).toEqual(sealed);
    weak.close();
  }, 30_000);
});

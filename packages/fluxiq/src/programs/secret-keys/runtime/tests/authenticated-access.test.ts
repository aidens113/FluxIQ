import { afterEach, describe, expect, it } from "vitest";
import { AesGcmSecretKeyHostProtection, type SecretKeyHostProtection } from "../../../../platform/custody/protection/index.ts";
import { SecretKeysService } from "../service.ts";
import { secretKeySessionDigest } from "../unlocks/index.ts";
import type { SecretKeyUsePrincipal } from "../access/index.ts";
import type { SecretKeyRecord } from "../../types.ts";
import { createMemoryRepository, createPasswordSealedKey, legacyV1Record, serviceRecord, WEAK_SCRYPT_PARAMETERS } from "./secret-key-fixtures.ts";

const NOW = 1_000_000;
const principal: SecretKeyUsePrincipal = { kind: "client", userId: "alice", trustedClientId: "client.one" };
const services: SecretKeysService[] = [];
afterEach(() => services.splice(0).forEach((service) => service.close()));

function fixture() {
  const keys = createMemoryRepository();
  const holders = createMemoryRepository();
  const active = new Set(["alice"]);
  const protector = new AesGcmSecretKeyHostProtection(() => ({ keyId: "master.one", key: Buffer.alloc(32, 11) }));
  function create(options: { storeId?: string; protection?: SecretKeyHostProtection | null } = {}) {
    const service = new SecretKeysService({
      repository: keys.repository, credentialUnlockRepository: holders.repository,
      now: () => NOW, passwordKdf: { testOnlyWeakParameters: WEAK_SCRYPT_PARAMETERS },
      ...(options.protection === null ? {} : { hostProtection: options.protection ?? protector, protectionStoreId: options.storeId ?? "tenant.one" }),
      vouchForHolder: ({ userId }) => active.has(userId),
      useAuthority: async ({ principal: actor, key }) => active.has(actor.userId) && key.createdBy === actor.userId && actor.kind !== "standing" ? { ownerUserId: actor.userId, expiresAtMs: NOW + 60_000 } : null
    });
    services.push(service);
    return service;
  }
  // A key saved now: host-sealed (version 3), with no password.
  const add = (service: SecretKeysService, value = "synthetic-provider-value") => service.createKey({ name: "Model", kind: "llm", provider: "anthropic", value, createdBy: "alice", nowMs: NOW });
  // A key saved before t928, sealed under Alice's password: what session and client custody, credential changes and sign-in repair still serve.
  const addPasswordSealed = (service: SecretKeysService, value = "synthetic-provider-value") => createPasswordSealedKey(service, { name: "Model", kind: "llm", provider: "anthropic", value, authorizationPassword: "synthetic-password", createdBy: "alice", nowMs: NOW });
  return { keys, holders, active, protector, create, add, addPasswordSealed };
}

async function use(service: SecretKeysService, id: string, actor = principal): Promise<string> {
  const authorization = await service.access.createUseAuthorization({ id, principal: actor });
  return (await service.revealKeyWithAuthorization({ id, authorizationId: authorization.authorizationId })).value;
}

describe("authenticated model-key access", () => {
  it("uses an owner's configured key immediately and after every held session is discarded", async () => {
    const f = fixture();
    const first = f.create();
    const key = await f.add(first);
    expect(f.keys.stored(key.id)?.hostProtection).toBeDefined();
    expect(f.keys.storedText(key.id)).not.toContain("synthetic-provider-value");
    await expect(use(first, key.id)).resolves.toBe("synthetic-provider-value");
    first.close();
    await expect(use(f.create(), key.id)).resolves.toBe("synthetic-provider-value");
  });

  it("enrolls before a key exists, then uses a later key without lifting or re-pairing", async () => {
    const f = fixture();
    const service = f.create();
    const holder = { holderKind: "paired-client" as const, holderId: "paired-client:client.one", userId: "alice", expiresAtMs: NOW + 60_000, approvingSessionDigest: secretKeySessionDigest("panel.one") };
    await service.credentialUnlocks.enrollCredential(holder, "synthetic-client-token");
    const stored = JSON.parse(f.holders.storedText(holder.holderId)!);
    expect(stored).not.toHaveProperty("lockedAtMs");
    expect(stored).not.toHaveProperty("lockReason");
    expect(await service.snapshotFor({ userId: "alice", sessionId: null, holderId: holder.holderId })).not.toHaveProperty("unlockTicket");
    const key = await f.add(service);
    await expect(use(service, key.id)).resolves.toBe("synthetic-provider-value");
    service.close();
    await expect(use(f.create(), key.id)).resolves.toBe("synthetic-provider-value");
  });

  it("delegates exact own-session custody of an old-format key and leaves the independently enrolled client usable after logout", async () => {
    const f = fixture();
    const service = f.create();
    const key = await f.addPasswordSealed(service);
    await service.unlockSession({ sessionId: "panel.one", userId: "alice", authorizationPassword: "synthetic-password", expiresAtMs: NOW + 60_000 });
    const holder = { holderKind: "paired-client" as const, holderId: "paired-client:client.one", userId: "alice", expiresAtMs: NOW + 60_000, approvingSessionDigest: secretKeySessionDigest("panel.one") };
    await service.credentialUnlocks.enrollCredential(holder, "synthetic-token", { delegateFrom: { userId: "alice", sessionId: "panel.one" } });
    expect(JSON.parse(f.holders.storedText(holder.holderId)!).boxes).toHaveProperty(key.id);
    await service.credentialUnlocks.sessionEnded({ digest: holder.approvingSessionDigest, revokerUserId: "alice", administrator: false, liveSessionDigests: new Set() });
    expect(JSON.parse(f.holders.storedText(holder.holderId)!)).not.toHaveProperty("lockedAtMs");
    await expect(use(service, key.id)).resolves.toBe("synthetic-provider-value");
    await expect(service.credentialUnlocks.enrollCredential({ ...holder, holderId: "paired-client:other" }, "other-token", { delegateFrom: { userId: "bob", sessionId: "panel.one" } })).rejects.toThrow("approving user's");
  });

  it("rechecks revocation at reveal consumption and denies foreign users and unbound standing grants", async () => {
    const f = fixture();
    const service = f.create();
    const key = await f.add(service);
    const authorization = await service.access.createUseAuthorization({ id: key.id, principal });
    f.active.delete("alice");
    await expect(service.revealKeyWithAuthorization({ id: key.id, authorizationId: authorization.authorizationId })).rejects.toThrow("not authorized");
    expect(service.activeRevealAuthorizationCount()).toBe(0);
    f.active.add("bob");
    await expect(use(service, key.id, { ...principal, userId: "bob" })).rejects.toThrow("not authorized");
    await expect(use(service, key.id, { kind: "standing", userId: "alice", authorizationId: "unbound", projectId: "project.one", flowId: "flow.one", purpose: "loop_verification" })).rejects.toThrow("not authorized");
    await expect(service.access.createUseAuthorization({ id: key.id, principal: null as unknown as SecretKeyUsePrincipal })).rejects.toThrow("principal");
  });

  it("reports unavailable saved ciphertext without creating a first-unlock state", async () => {
    const f = fixture();
    const legacy = f.create({ protection: null });
    const key = await f.addPasswordSealed(legacy);
    legacy.close();
    const service = f.create();
    const snapshot = await service.snapshotFor({ userId: "alice", sessionId: null });
    expect(snapshot.keys[0]?.availability).toEqual({ state: "unavailable", code: "legacy_recovery_required" });
    expect(snapshot).not.toHaveProperty("lockedClients");
    expect(snapshot.keys[0]).not.toHaveProperty("unlocked");
    await expect(use(service, key.id)).rejects.toMatchObject({ code: "legacy_recovery_required" });
    await service.unlockSession({ sessionId: "login", userId: "alice", authorizationPassword: "synthetic-password", expiresAtMs: NOW + 60_000 });
    service.close();
    await expect(use(f.create(), key.id)).resolves.toBe("synthetic-provider-value");
  });

  it("migrates a V1 owner record through normal login and keeps it usable after restart", async () => {
    const f = fixture();
    const legacy = legacyV1Record({ id: "legacy.one", value: "synthetic-v1", password: "synthetic-password", createdBy: "alice", atMs: NOW });
    f.keys.replace(legacy.id, legacy);
    const service = f.create();
    await service.unlockSession({ sessionId: "login", userId: "alice", authorizationPassword: "synthetic-password", expiresAtMs: NOW + 60_000 });
    expect(f.keys.stored(legacy.id)?.hostProtection).toBeDefined();
    service.close();
    await expect(use(f.create(), legacy.id)).resolves.toBe("synthetic-v1");
  });

  it("rejects a wrap copied into another store and distinguishes a missing master key", async () => {
    const f = fixture();
    const key = await f.add(f.create());
    await expect(use(f.create({ storeId: "tenant.other" }), key.id)).rejects.toMatchObject({ code: "ciphertext_invalid" });
    const missing = f.create({ protection: new AesGcmSecretKeyHostProtection(() => undefined) });
    await expect(use(missing, key.id)).rejects.toMatchObject({ code: "host_protection_unavailable" });
    expect((await missing.snapshotFor({ userId: "alice", sessionId: null })).keys[0]?.availability).toEqual({ state: "unavailable", code: "host_protection_unavailable" });
  });

  it("keeps a prepared new-password seal of an old-format key paired with recovery material across restart", async () => {
    const f = fixture();
    const service = f.create();
    const key = await f.addPasswordSealed(service);
    await service.prepareCredentialChange({ userId: "alice", currentPassword: "synthetic-password", nextPassword: "synthetic-next" });
    expect(f.keys.stored(key.id)?.pendingHostProtection).toBeDefined();
    service.close();
    const restarted = f.create();
    await restarted.unlockSession({ sessionId: "new-login", userId: "alice", authorizationPassword: "synthetic-next", expiresAtMs: NOW + 60_000 });
    restarted.close();
    await expect(use(f.create(), key.id)).resolves.toBe("synthetic-provider-value");
  });

  it("never publishes a key whose required durable write failed", async () => {
    const f = fixture();
    const service = f.create();
    f.keys.repository.put = async () => { throw new Error("synthetic write failure"); };
    await expect(f.add(service)).rejects.toThrow("synthetic write failure");
    expect((await service.snapshot()).keys).toEqual([]);
  });

  it("allows concurrent valid uses whose only competing writes are reveal audit timestamps", async () => {
    const f = fixture();
    const service = f.create();
    const key = await f.add(service);
    await expect(Promise.all(Array.from({ length: 8 }, () => use(service, key.id)))).resolves.toEqual(Array(8).fill("synthetic-provider-value"));
  });

  it("repairs an old-format key's inaccessible old-master wrap from a legitimate normal password proof", async () => {
    const f = fixture();
    const first = f.create();
    const key = await f.addPasswordSealed(first);
    first.close();
    const current = new AesGcmSecretKeyHostProtection(({ keyId }) => !keyId || keyId === "master.two" ? { keyId: "master.two", key: Buffer.alloc(32, 22) } : undefined);
    const service = f.create({ protection: current });
    await expect(use(service, key.id)).rejects.toMatchObject({ code: "host_protection_unavailable" });
    await service.unlockSession({ sessionId: "normal-login", userId: "alice", authorizationPassword: "synthetic-password", expiresAtMs: NOW + 60_000 });
    expect(f.keys.stored(key.id)?.hostProtection?.sealed.keyId).toBe("master.two");
    service.close();
    await expect(use(f.create({ protection: current }), key.id)).resolves.toBe("synthetic-provider-value");
  });

  it("says a host-sealed key under a lost master is unavailable, and no password sign-in can open it: its owner saves the value again", async () => {
    const f = fixture();
    const first = f.create();
    const key = await f.add(first);
    first.close();
    const current = new AesGcmSecretKeyHostProtection(({ keyId }) => !keyId || keyId === "master.two" ? { keyId: "master.two", key: Buffer.alloc(32, 22) } : undefined);
    const service = f.create({ protection: current });
    await expect(use(service, key.id)).rejects.toMatchObject({ code: "host_protection_unavailable" });
    await service.unlockSession({ sessionId: "normal-login", userId: "alice", authorizationPassword: "synthetic-password", expiresAtMs: NOW + 60_000 });
    expect(f.keys.stored(key.id)?.hostProtection?.sealed.keyId).toBe("master.one");
    expect((await service.snapshotFor({ userId: "alice", sessionId: "normal-login" })).keys[0]?.availability).toEqual({ state: "unavailable", code: "host_protection_unavailable" });
    await service.rotateKey({ id: key.id, value: "synthetic-saved-again", actorUserId: "alice", nowMs: NOW });
    await expect(use(service, key.id)).resolves.toBe("synthetic-saved-again");
  });

  it("rejects another same-user panel's material when it was not the approving session", async () => {
    const f = fixture();
    const service = f.create();
    await f.addPasswordSealed(service);
    await service.unlockSession({ sessionId: "actual", userId: "alice", authorizationPassword: "synthetic-password", expiresAtMs: NOW + 60_000 });
    await service.unlockSession({ sessionId: "convenient", userId: "alice", authorizationPassword: "synthetic-password", expiresAtMs: NOW + 60_000 });
    const holder = { holderKind: "paired-client" as const, holderId: "paired-client:client.one", userId: "alice", expiresAtMs: NOW + 60_000, approvingSessionDigest: secretKeySessionDigest("actual") };
    await expect(service.credentialUnlocks.enrollCredential(holder, "synthetic-token", { delegateFrom: { userId: "alice", sessionId: "convenient" } })).rejects.toThrow("approving user's");
    await expect(service.credentialUnlocks.presentCredential(holder, "synthetic-token", { verified: true, delegateFrom: { userId: "alice", sessionId: "convenient" } })).rejects.toThrow("approving user's");
    expect(f.holders.storedText(holder.holderId)).toBeUndefined();
    await expect(service.credentialUnlocks.presentCredential(holder, "synthetic-token", { verified: true, delegateFrom: { userId: "alice", sessionId: "actual" } })).resolves.toMatchObject({ unlockedKeyCount: 1 });
  });

  it("does not hold a delegated key if the credential-envelope persistence fails", async () => {
    const f = fixture();
    const service = f.create();
    const key = await f.addPasswordSealed(service);
    await service.unlockSession({ sessionId: "actual", userId: "alice", authorizationPassword: "synthetic-password", expiresAtMs: NOW + 60_000 });
    const holder = { holderKind: "paired-client" as const, holderId: "paired-client:client.one", userId: "alice", expiresAtMs: NOW + 60_000, approvingSessionDigest: secretKeySessionDigest("actual") };
    f.holders.repository.put = async () => { throw new Error("synthetic-holder-write"); };
    await expect(service.credentialUnlocks.presentCredential(holder, "synthetic-token", { verified: true, delegateFrom: { userId: "alice", sessionId: "actual" } })).rejects.toThrow("synthetic-holder-write");
    const held = service.credentialUnlocks.heldHandleFor(holder.holderId);
    await expect(service.createSessionRevealAuthorization({ sessionId: held, userId: "alice", id: key.id })).rejects.toThrow("unavailable");
    expect(f.holders.storedText(holder.holderId)).toBeUndefined();
  });

  it("reconciles an ambiguous rotation write before allowing any later use", async () => {
    const f = fixture();
    const service = f.create();
    const key = await f.add(service);
    const put = f.keys.repository.put.bind(f.keys.repository);
    f.keys.repository.put = async record => {
      await put(record);
      throw new Error("synthetic-after-commit");
    };
    await expect(service.rotateKey({ id: key.id, value: "synthetic-new-value", actorUserId: "alice", nowMs: NOW })).rejects.toThrow("synthetic-after-commit");
    f.keys.repository.put = put;
    await expect(use(service, key.id)).resolves.toBe("synthetic-new-value");
  });

  it("denies mutation between asynchronous authority checks even under a fixed clock", async () => {
    const f = fixture();
    const service = f.create();
    const key = await f.add(service);
    const authorization = await service.access.createUseAuthorization({ id: key.id, principal });
    await service.updateKey({ id: key.id, provider: "other", nowMs: NOW });
    expect(serviceRecord(service, key.id)?.updatedAtMs).toBeGreaterThan(NOW);
    await expect(service.revealKeyWithAuthorization({ id: key.id, authorizationId: authorization.authorizationId })).rejects.toThrow("unavailable");
  });

  it("binds mint-time semantic metadata even if a faulty writer keeps the same timestamp", async () => {
    const f = fixture();
    const service = f.create();
    const key = await f.add(service);
    const authorization = await service.access.createUseAuthorization({ id: key.id, principal });
    const record = serviceRecord(service, key.id)!;
    const store = (service as unknown as { store: { set(record: SecretKeyRecord): void } }).store;
    store.set({ ...record, provider: "other-provider", updatedAtMs: record.updatedAtMs });
    await expect(service.revealKeyWithAuthorization({ id: key.id, authorizationId: authorization.authorizationId })).rejects.toThrow("no longer valid");
  });
});

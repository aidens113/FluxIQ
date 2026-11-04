// What it takes for a holder to reach a person's key: a proof from that person,
// naming it, and a holder the host stands behind. And the other side: once set up,
// a normal person is not asked again. Provider-free and in memory; every secret is a dummy.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RecordEnvelope } from "../../../../database-manager/index.ts";
import type { SecretKeyCredentialHolder, SecretKeyCredentialUnlockRecord } from "../../../types.ts";
import { SecretKeysService } from "../../service.ts";
import { createMemoryRepository, WEAK_SCRYPT_PARAMETERS, type MemoryRepository } from "../../tests/secret-key-fixtures.ts";
import type { SecretKeyHolderVouch } from "../credential-unlocks.ts";
import { secretKeySessionDigest } from "../credential-unlocks.ts";
import { newCredentialUnlockKeyPair, openCredentialUnlockBox, unwrapCredentialUnlockPrivateKey, wrapCredentialUnlockPrivateKey } from "../crypto.ts";

const weakKdf = { testOnlyWeakParameters: WEAK_SCRYPT_PARAMETERS };
const PASSWORD = "dummy-password-owner";
const KEY_VALUE = "dummy-provider-key-value-0001";
const USER = "user.owner";
const DAY = 24 * 60 * 60 * 1000;
const NOW = 1_000_000;
const SESSION = "session.owner";
const CREDENTIAL_ONE = "dummy-browser-credential-0000000000000000000001";
const CREDENTIAL_TWO = "dummy-browser-credential-0000000000000000000002";
const CREDENTIAL_NEXT = "dummy-browser-credential-0000000000000000000003";

type Repositories = { keys: MemoryRepository; unlocks: MemoryRepository };

let clock = NOW;

beforeEach(() => {
  vi.useFakeTimers();
  clock = NOW;
});
afterEach(() => vi.useRealTimers());

function repositories(): Repositories {
  return { keys: createMemoryRepository(), unlocks: createMemoryRepository() };
}

function boot(repos: Repositories, vouchForHolder: SecretKeyHolderVouch = () => true): SecretKeysService {
  return new SecretKeysService({ repository: repos.keys.repository, credentialUnlockRepository: repos.unlocks.repository, now: () => clock, passwordKdf: weakKdf, vouchForHolder });
}

function browser(id: string, approvingSessionDigest?: string): SecretKeyCredentialHolder {
  return { holderKind: "paired-client", holderId: `paired-client:${id}`, userId: USER, expiresAtMs: NOW + 60 * DAY, label: `Chrome ${id}`, ...(approvingSessionDigest ? { approvingSessionDigest } : {}) };
}

function handle(service: SecretKeysService, holder: SecretKeyCredentialHolder): string {
  return service.credentialUnlocks.heldHandleFor(holder.holderId);
}

function storedRow(repos: Repositories, holder: { holderId: string }): SecretKeyCredentialUnlockRecord {
  return repos.unlocks.stored(holder.holderId) as unknown as SecretKeyCredentialUnlockRecord;
}

async function signIn(service: SecretKeysService, sessionId = SESSION, unlockClients?: readonly string[]): Promise<void> {
  await service.unlockSession({ sessionId, userId: USER, authorizationPassword: PASSWORD, expiresAtMs: NOW + 12 * 60 * 60 * 1000, nowMs: clock, ...(unlockClients ? { unlockClients, passwordVerified: true } : {}) });
}

async function release(service: SecretKeysService, sessionId: string, keyId: string): Promise<string | null> {
  try {
    const authorization = await service.createSessionRevealAuthorization({ id: keyId, sessionId, userId: USER, ttlMs: 10_000 });
    return (await service.revealKeyWithAuthorization({ authorizationId: authorization.authorizationId, id: keyId })).value;
  } catch {
    return null;
  }
}

async function withKey(repos: Repositories, vouch?: SecretKeyHolderVouch): Promise<{ service: SecretKeysService; keyId: string }> {
  const service = boot(repos, vouch);
  const key = await service.createKey({ name: "Model", value: KEY_VALUE, authorizationPassword: PASSWORD, createdBy: USER, nowMs: clock });
  await signIn(service);
  return { service, keyId: key.id };
}

/** A browser the person has unlocked, by the password at its approval. */
async function unlockedBrowser(service: SecretKeysService, id: string, credential: string, approvingSession = SESSION): Promise<SecretKeyCredentialHolder> {
  const holder = browser(id, secretKeySessionDigest(approvingSession));
  await service.credentialUnlocks.presentCredential(holder, credential, { verified: true });
  await signIn(service, approvingSession, [holder.holderId]);
  return holder;
}

describe("a new browser gets the key only on a proof", () => {
  it("takes nothing from a live panel unlock when it first appears, in memory or in the store", async () => {
    const repos = repositories();
    const { service, keyId } = await withKey(repos);
    expect(await release(service, SESSION, keyId)).toBe(KEY_VALUE);
    const holder = browser("new", secretKeySessionDigest(SESSION));
    await expect(service.credentialUnlocks.presentCredential(holder, CREDENTIAL_ONE, { verified: true })).resolves.toEqual({ unlockedKeyCount: 0 });
    expect(await release(service, handle(service, holder), keyId)).toBeNull();
    expect(storedRow(repos, holder).boxes).toEqual({});
    expect(storedRow(repos, holder).lockReason).toBe("first_unlock");
  });

  it("is not reached by an ordinary sign-in afterwards, nor by a key added afterwards", async () => {
    const repos = repositories();
    const { service, keyId } = await withKey(repos);
    const holder = browser("new");
    await service.credentialUnlocks.presentCredential(holder, CREDENTIAL_ONE, { verified: true });
    await signIn(service, "session.again");
    const later = await service.createKey({ name: "Later", value: "dummy-later-value", authorizationPassword: PASSWORD, createdBy: USER, nowMs: clock + 1 });
    expect(storedRow(repos, holder).boxes).toEqual({});
    expect(await release(service, handle(service, holder), keyId)).toBeNull();
    expect(await release(service, handle(service, holder), later.id)).toBeNull();
  });

  it("the password at approval unlocks it at once, and it lasts", async () => {
    const repos = repositories();
    const { service, keyId } = await withKey(repos);
    const holder = await unlockedBrowser(service, "new", CREDENTIAL_ONE);
    expect(await release(service, handle(service, holder), keyId)).toBe(KEY_VALUE);
    service.close();
    const restarted = boot(repos);
    await restarted.credentialUnlocks.presentCredential(holder, CREDENTIAL_ONE, { verified: true });
    expect(await release(restarted, handle(restarted, holder), keyId)).toBe(KEY_VALUE);
  });

  it("a browser already paired when this ships, with no row, gets the same one-time step and is not seeded", async () => {
    const repos = repositories();
    const { service, keyId } = await withKey(repos);
    service.close();
    const restarted = boot(repos);
    await signIn(restarted);
    const holder = browser("older");
    await restarted.credentialUnlocks.presentCredential(holder, CREDENTIAL_ONE, { verified: true });
    expect(restarted.keyLockReason({ userId: USER, holderId: holder.holderId })).toBe("first_unlock");
    expect(await release(restarted, handle(restarted, holder), keyId)).toBeNull();
    await signIn(restarted, SESSION, [holder.holderId]);
    expect(await release(restarted, handle(restarted, holder), keyId)).toBe(KEY_VALUE);
  });

  it("after a reset nobody proved the old password for, no live unlock remains, and a browser paired then takes nothing", async () => {
    const repos = repositories();
    const { service, keyId } = await withKey(repos);
    await service.credentialUnlocks.lockPerson(USER, "password_reset");
    expect(await release(service, SESSION, keyId)).toBeNull();
    expect(service.unlockedSessionFor(USER)).toBeNull();
    const holder = browser("after-reset");
    await service.credentialUnlocks.presentCredential(holder, CREDENTIAL_ONE, { verified: true });
    expect(storedRow(repos, holder).boxes).toEqual({});
    expect(await release(service, handle(service, holder), keyId)).toBeNull();
  });

  it("holds a paired client's unlock under a random handle, never its public id", async () => {
    const repos = repositories();
    const { service, keyId } = await withKey(repos);
    const holder = await unlockedBrowser(service, "new", CREDENTIAL_ONE);
    expect(handle(service, holder)).not.toContain("new");
    expect(handle(service, holder).startsWith("paired-client:")).toBe(true);
    expect(service.holdingSession(holder.holderId, USER)).toBeNull();
    expect(await release(service, holder.holderId, keyId)).toBeNull();
  });
});

describe("only a holder the host vouches for is boxed to", () => {
  /** A stored row nobody issued, with a public key its writer holds the other half of. */
  function forgedRow(holderId: string, userId = USER) {
    const pair = newCredentialUnlockKeyPair();
    const row = {
      recordType: "secret-key-credential-unlock", id: holderId, holderId, holderKind: "paired-client", userId, expiresAtMs: NOW + 60 * DAY,
      publicKey: pair.publicKey, wrap: wrapCredentialUnlockPrivateKey(pair.privateKeyDer, "dummy-forged-credential", { holderId, userId }), boxes: {}, lockedAtMs: NOW, updatedAtMs: NOW
    };
    return { row, privateKeyDer: pair.privateKeyDer };
  }

  it("a forged row takes nothing when the person signs in, adds or rotates a key, and is not offered to them", async () => {
    const repos = repositories();
    const first = await withKey(repos);
    first.service.close();
    const forged = forgedRow("paired-client:forged");
    repos.unlocks.replace(forged.row.id, forged.row);
    const real = "paired-client:real";
    const vouch: SecretKeyHolderVouch = (record) => record.holderId === real;
    const service = boot(repos, vouch);
    await signIn(service);
    const holder = browser("real");
    await service.credentialUnlocks.presentCredential(holder, CREDENTIAL_ONE, { verified: true });
    await signIn(service, SESSION, [real, forged.row.id]);
    const added = await service.createKey({ name: "Added", value: "dummy-added-value", authorizationPassword: PASSWORD, createdBy: USER, nowMs: clock + 1 });
    await service.rotateKey({ id: first.keyId, value: "dummy-rotated-value", authorizationPassword: PASSWORD, actorUserId: USER });
    expect(storedRow(repos, forged.row).boxes).toEqual({});
    expect(Object.keys(storedRow(repos, holder).boxes).sort()).toEqual([first.keyId, added.id].sort());
    expect((await service.credentialUnlocks.lockedClientsFor(USER)).map((client) => client.holderId)).not.toContain(forged.row.id);
  });

  it("a host that forgot to bind its answer boxes to nobody: failing closed", async () => {
    const repos = repositories();
    const boundless = new SecretKeysService({ repository: repos.keys.repository, credentialUnlockRepository: repos.unlocks.repository, now: () => clock, passwordKdf: weakKdf });
    const key = await boundless.createKey({ name: "Model", value: KEY_VALUE, authorizationPassword: PASSWORD, createdBy: USER, nowMs: clock });
    const holder = browser("real");
    await boundless.credentialUnlocks.presentCredential(holder, CREDENTIAL_ONE, { verified: true });
    await signIn(boundless, SESSION, [holder.holderId]);
    expect(storedRow(repos, holder).boxes).toEqual({});
    expect(await release(boundless, handle(boundless, holder), key.id)).toBeNull();
    // The session that proved itself is unaffected.
    expect(await release(boundless, SESSION, key.id)).toBe(KEY_VALUE);
  });

  it("a holder whose trust has ended takes nothing further", async () => {
    const repos = repositories();
    let active = true;
    const { service } = await withKey(repos, () => active);
    const holder = await unlockedBrowser(service, "real", CREDENTIAL_ONE);
    active = false;
    const added = await service.createKey({ name: "Added", value: "dummy-added-value", authorizationPassword: PASSWORD, createdBy: USER, nowMs: clock + 1 });
    expect(storedRow(repos, holder).boxes[added.id]).toBeUndefined();
  });
});

describe("a password change the person proved", () => {
  async function twoBrowsers() {
    const repos = repositories();
    const { service, keyId } = await withKey(repos);
    await signIn(service, "session.elsewhere");
    const kept = await unlockedBrowser(service, "kept", CREDENTIAL_ONE, SESSION);
    const other = await unlockedBrowser(service, "other", CREDENTIAL_TWO, "session.elsewhere");
    const { changeId } = await service.prepareCredentialChange({ userId: USER, currentPassword: PASSWORD, nextPassword: "dummy-password-next", actorSessionId: SESSION });
    await service.commitCredentialChange(changeId);
    return { repos, service, keyId, kept, other };
  }

  it("keeps the browser its session approved, and locks the other as a setup step", async () => {
    const { service, keyId, kept, other, repos } = await twoBrowsers();
    expect(await release(service, handle(service, kept), keyId)).toBe(KEY_VALUE);
    expect(await release(service, handle(service, other), keyId)).toBeNull();
    expect(storedRow(repos, other).boxes).toEqual({});
    expect(storedRow(repos, other).lockReason).toBe("password_changed");
    expect(service.keyLockReason({ userId: USER, holderId: other.holderId })).toBe("password_changed");
  });

  it("the other stays locked across a restart, and other sessions' unlocks are gone", async () => {
    const { service, keyId, kept, other, repos } = await twoBrowsers();
    expect(await release(service, "session.elsewhere", keyId)).toBeNull();
    service.close();
    const restarted = boot(repos);
    await restarted.credentialUnlocks.presentCredential(kept, CREDENTIAL_ONE, { verified: true });
    await restarted.credentialUnlocks.presentCredential(other, CREDENTIAL_TWO, { verified: true });
    expect(await release(restarted, handle(restarted, kept), keyId)).toBe(KEY_VALUE);
    expect(await release(restarted, handle(restarted, other), keyId)).toBeNull();
  });

  it("with no session named, keeps no browser", async () => {
    const repos = repositories();
    const { service, keyId } = await withKey(repos);
    const holder = await unlockedBrowser(service, "one", CREDENTIAL_ONE);
    const { changeId } = await service.prepareCredentialChange({ userId: USER, currentPassword: PASSWORD, nextPassword: "dummy-password-next" });
    await service.commitCredentialChange(changeId);
    expect(await release(service, handle(service, holder), keyId)).toBeNull();
  });
});

describe("an explicit unlock lifts only what the person chose", () => {
  async function twoLocked() {
    const repos = repositories();
    const { service, keyId } = await withKey(repos);
    const one = browser("one");
    const two = browser("two");
    await service.credentialUnlocks.presentCredential(one, CREDENTIAL_ONE, { verified: true });
    await service.credentialUnlocks.presentCredential(two, CREDENTIAL_TWO, { verified: true });
    return { repos, service, keyId, one, two };
  }

  it("lifts the one named, not the other", async () => {
    const { service, keyId, one, two } = await twoLocked();
    await signIn(service, SESSION, [one.holderId]);
    expect(await release(service, handle(service, one), keyId)).toBe(KEY_VALUE);
    expect(await release(service, handle(service, two), keyId)).toBeNull();
    expect((await service.credentialUnlocks.lockedClientsFor(USER)).map((client) => client.holderId)).toEqual([two.holderId]);
  });

  it("naming none lifts none", async () => {
    const { service, keyId, one, two } = await twoLocked();
    await signIn(service);
    expect(await release(service, handle(service, one), keyId)).toBeNull();
    expect(await release(service, handle(service, two), keyId)).toBeNull();
  });

  it("a lost laptop, locked by a sign-out, stays locked when the person unlocks their new one", async () => {
    const { service, keyId, one, two } = await twoLocked();
    await signIn(service, SESSION, [one.holderId]);
    await service.credentialUnlocks.lock(one.holderId, "signed_out");
    await signIn(service, SESSION, [two.holderId]);
    expect(await release(service, handle(service, two), keyId)).toBe(KEY_VALUE);
    expect(await release(service, handle(service, one), keyId)).toBeNull();
  });

  it("offers each locked browser with its label and last use, for choosing", async () => {
    const { service, one } = await twoLocked();
    const [listed] = await service.credentialUnlocks.lockedClientsFor(USER);
    expect(listed).toMatchObject({ holderId: one.holderId, label: "Chrome one", lastUsedAtMs: NOW });
  });
});

describe("a lock with a store that fails", () => {
  /** Refuses writes to the named rows, as a store error would. */
  function refusing(repos: Repositories, refused: Set<string>): Repositories {
    const inner = repos.unlocks.repository;
    const repository = { ...inner, put: async (record: RecordEnvelope) => {
      if (refused.has(record.id)) throw new Error("dummy store refused the write");
      return await inner.put(record);
    } };
    return { keys: repos.keys, unlocks: { ...repos.unlocks, repository } };
  }

  it("attempts every holder, keeps nothing in memory, and raises them together", async () => {
    const repos = repositories();
    const refused = new Set<string>();
    const wrapped = refusing(repos, refused);
    const { service, keyId } = await withKey(wrapped);
    const one = await unlockedBrowser(service, "one", CREDENTIAL_ONE);
    const two = await unlockedBrowser(service, "two", CREDENTIAL_TWO);
    refused.add(one.holderId);
    await expect(service.credentialUnlocks.lockPerson(USER, "sessions_ended")).rejects.toBeInstanceOf(AggregateError);
    // The refused write stopped neither: the other's lock landed, and neither key is in memory.
    expect(storedRow(repos, two).lockReason).toBe("sessions_ended");
    expect(await release(service, handle(service, one), keyId)).toBeNull();
    expect(await release(service, handle(service, two), keyId)).toBeNull();
    // In this process the refused one stays locked as well, once the store takes writes again.
    refused.clear();
    await expect(service.credentialUnlocks.presentCredential(one, CREDENTIAL_ONE, { verified: true })).resolves.toEqual({ unlockedKeyCount: 0 });
  });

  it("a session ending attempts every browser it locks, the same way", async () => {
    const repos = repositories();
    const refused = new Set<string>();
    const { service } = await withKey(refusing(repos, refused));
    const one = await unlockedBrowser(service, "one", CREDENTIAL_ONE);
    const two = await unlockedBrowser(service, "two", CREDENTIAL_TWO);
    refused.add(one.holderId);
    await expect(service.credentialUnlocks.sessionEnded({ digest: secretKeySessionDigest(SESSION), revokerUserId: USER, administrator: false, liveSessionDigests: new Set() })).rejects.toBeInstanceOf(AggregateError);
    expect(storedRow(repos, two).lockReason).toBe("signed_out");
  });
});

describe("a proof that opened nothing", () => {
  it("lifts no lock from someone whose keys it could not open", async () => {
    const repos = repositories();
    const { service } = await withKey(repos);
    const holder = browser("new");
    await service.credentialUnlocks.presentCredential(holder, CREDENTIAL_ONE, { verified: true });
    await service.unlockSession({ sessionId: "session.other", userId: USER, authorizationPassword: "dummy-other-password", expiresAtMs: NOW + DAY, nowMs: clock, unlockClients: [holder.holderId], passwordVerified: true });
    expect((await service.credentialUnlocks.lockedClientsFor(USER)).map((client) => client.holderId)).toEqual([holder.holderId]);
    await signIn(service, "session.later");
    expect(storedRow(repos, holder).boxes).toEqual({});
  });

  it("still lifts for someone with no keys yet, whose first key then reaches that browser", async () => {
    const repos = repositories();
    const service = boot(repos);
    const holder = browser("new");
    await service.credentialUnlocks.presentCredential(holder, CREDENTIAL_ONE, { verified: true });
    await service.unlockSession({ sessionId: SESSION, userId: USER, authorizationPassword: PASSWORD, expiresAtMs: NOW + DAY, nowMs: clock, unlockClients: [holder.holderId], passwordVerified: true });
    const key = await service.createKey({ name: "Model", value: KEY_VALUE, authorizationPassword: PASSWORD, createdBy: USER, nowMs: clock });
    expect(await release(service, handle(service, holder), key.id)).toBe(KEY_VALUE);
  });

  it("still lifts after a recorded reset, whose old keys no password opens", async () => {
    const repos = repositories();
    const { service } = await withKey(repos);
    await service.credentialUnlocks.lockPerson(USER, "password_reset");
    const holder = browser("new");
    await service.credentialUnlocks.presentCredential(holder, CREDENTIAL_ONE, { verified: true });
    await service.unlockSession({ sessionId: "session.after", userId: USER, authorizationPassword: "dummy-new-password", expiresAtMs: NOW + DAY, nowMs: clock, unlockClients: [holder.holderId], passwordVerified: true });
    expect(await service.credentialUnlocks.lockedClientsFor(USER)).toEqual([]);
  });
});

describe("a credential's confirmation while another is only written ahead", () => {
  it("does not give up the generation of the credential Core still accepts", async () => {
    const repos = repositories();
    const { service, keyId } = await withKey(repos);
    const holder = await unlockedBrowser(service, "one", CREDENTIAL_ONE);
    await service.credentialUnlocks.rotateCredential({ holderId: holder.holderId, userId: USER, previousCredential: CREDENTIAL_ONE, nextCredential: CREDENTIAL_NEXT });
    await service.credentialUnlocks.confirmCredential({ holderId: holder.holderId, userId: USER, credentialDigest: secretKeySessionDigest(CREDENTIAL_ONE) });
    service.close();
    const restarted = boot(repos);
    await restarted.credentialUnlocks.presentCredential(holder, CREDENTIAL_ONE, { verified: true });
    expect(await release(restarted, handle(restarted, holder), keyId)).toBe(KEY_VALUE);
    expect(storedRow(repos, holder).lockedAtMs).toBeUndefined();
  });

  it("promotes the one it names, once that is the one in use", async () => {
    const repos = repositories();
    const { service, keyId } = await withKey(repos);
    const holder = await unlockedBrowser(service, "one", CREDENTIAL_ONE);
    await service.credentialUnlocks.rotateCredential({ holderId: holder.holderId, userId: USER, previousCredential: CREDENTIAL_ONE, nextCredential: CREDENTIAL_NEXT });
    await service.credentialUnlocks.confirmCredential({ holderId: holder.holderId, userId: USER, credentialDigest: secretKeySessionDigest(CREDENTIAL_NEXT) });
    expect(storedRow(repos, holder).pending).toBeUndefined();
    service.close();
    const restarted = boot(repos);
    await expect(restarted.credentialUnlocks.presentCredential(holder, CREDENTIAL_ONE)).resolves.toEqual({ unlockedKeyCount: 0 });
    await restarted.credentialUnlocks.presentCredential(holder, CREDENTIAL_NEXT, { verified: true });
    expect(await release(restarted, handle(restarted, holder), keyId)).toBe(KEY_VALUE);
  });
});

describe("a lock the store refused", () => {
  it("is written as soon as the store takes writes again, so a restart then finds it locked", async () => {
    const repos = repositories();
    const refused = new Set<string>();
    const inner = repos.unlocks.repository;
    const repository = { ...inner, put: async (record: RecordEnvelope) => {
      if (refused.has(record.id)) throw new Error("dummy store refused the write");
      return await inner.put(record);
    } };
    const { service, keyId } = await withKey({ keys: repos.keys, unlocks: { ...repos.unlocks, repository } });
    const holder = await unlockedBrowser(service, "one", CREDENTIAL_ONE);
    refused.add(holder.holderId);
    await expect(service.credentialUnlocks.lock(holder.holderId, "signed_out")).rejects.toThrow("dummy store refused");
    refused.clear();
    await service.credentialUnlocks.presentPanelSession({ sessionId: SESSION, userId: USER, expiresAtMs: NOW + DAY });
    expect(storedRow(repos, holder).lockedAtMs).toBeDefined();
    service.close();
    const restarted = boot(repos);
    await restarted.credentialUnlocks.presentCredential(holder, CREDENTIAL_ONE, { verified: true });
    expect(await release(restarted, handle(restarted, holder), keyId)).toBeNull();
  });
});

describe("a forget and a reconnect in flight", () => {
  it("a verified credential presented after the forget brings nothing back", async () => {
    const repos = repositories();
    const { service, keyId } = await withKey(repos);
    const holder = await unlockedBrowser(service, "one", CREDENTIAL_ONE);
    await service.credentialUnlocks.forget(holder.holderId);
    await expect(service.credentialUnlocks.presentCredential(holder, CREDENTIAL_ONE, { verified: true })).resolves.toEqual({ unlockedKeyCount: 0 });
    expect(repos.unlocks.storedText(holder.holderId)).toBeUndefined();
    expect(await release(service, handle(service, holder), keyId)).toBeNull();
  });
});

describe("a rotated credential and an old copy of its row", () => {
  it("the new generation has its own key pair, so an old copy opens nothing written after", async () => {
    const repos = repositories();
    const { service } = await withKey(repos);
    const holder = await unlockedBrowser(service, "one", CREDENTIAL_ONE);
    const oldCopy = storedRow(repos, holder);
    await service.credentialUnlocks.rotateCredential({ holderId: holder.holderId, userId: USER, previousCredential: CREDENTIAL_ONE, nextCredential: CREDENTIAL_NEXT });
    await service.credentialUnlocks.confirmCredential({ holderId: holder.holderId, userId: USER, credentialDigest: secretKeySessionDigest(CREDENTIAL_NEXT) });
    const added = await service.createKey({ name: "Added", value: "dummy-added-value", authorizationPassword: PASSWORD, createdBy: USER, nowMs: clock + 1 });
    const now = storedRow(repos, holder);
    expect(now.publicKey).not.toBe(oldCopy.publicKey);
    expect(now.pending).toBeUndefined();
    const binding = { holderId: holder.holderId, userId: USER };
    const oldPrivate = unwrapCredentialUnlockPrivateKey(oldCopy.wrap, CREDENTIAL_ONE, binding);
    expect(oldPrivate).not.toBeNull();
    expect(openCredentialUnlockBox(now.boxes[added.id]!, oldPrivate!, { ...binding, recordId: added.id })).toBeNull();
    oldPrivate?.fill(0);
  });

  it("keys added while a rotation waits to be confirmed reach both generations, whichever is confirmed", async () => {
    const repos = repositories();
    const { service } = await withKey(repos);
    const holder = await unlockedBrowser(service, "one", CREDENTIAL_ONE);
    await service.credentialUnlocks.rotateCredential({ holderId: holder.holderId, userId: USER, previousCredential: CREDENTIAL_ONE, nextCredential: CREDENTIAL_NEXT });
    const added = await service.createKey({ name: "Added", value: "dummy-added-value", authorizationPassword: PASSWORD, createdBy: USER, nowMs: clock + 1 });
    await service.credentialUnlocks.confirmCredential({ holderId: holder.holderId, userId: USER, credentialDigest: secretKeySessionDigest(CREDENTIAL_ONE) });
    service.close();
    const restarted = boot(repos);
    await restarted.credentialUnlocks.presentCredential(holder, CREDENTIAL_ONE, { verified: true });
    expect(await release(restarted, handle(restarted, holder), added.id)).toBe("dummy-added-value");
  });
});

describe("the panel page speaking while its person unlocks", () => {
  it("does not cost them the unlock: the page's own polling presents the same session", async () => {
    vi.useRealTimers();
    const repos = repositories();
    const { service, keyId } = await withKey(repos);
    const session = { sessionId: SESSION, userId: USER, expiresAtMs: NOW + 12 * 60 * 60 * 1000 };
    const unlocking = service.unlockSession({ ...session, authorizationPassword: PASSWORD, nowMs: clock });
    const polling = [0, 1, 2].map(async () => {
      await new Promise((resolve) => setImmediate(resolve));
      return await service.credentialUnlocks.presentPanelSession(session);
    });
    await expect(unlocking).resolves.toMatchObject({ unlockedKeyCount: 1 });
    await Promise.all(polling);
    expect(await release(service, SESSION, keyId)).toBe(KEY_VALUE);
  });
});

describe("after setup, a normal person is not asked again", () => {
  it("across a restart, a reconnect and the panel session expiring, one after another", async () => {
    const repos = repositories();
    const { service, keyId } = await withKey(repos);
    const holder = await unlockedBrowser(service, "one", CREDENTIAL_ONE);
    const notAsked = async (current: SecretKeysService): Promise<void> => {
      expect(current.keyNeedsUnlockNow({ userId: USER, sessionId: handle(current, holder) })).toBe(false);
      expect(await release(current, handle(current, holder), keyId)).toBe(KEY_VALUE);
    };
    await notAsked(service);

    // Its socket drops and it reconnects.
    service.credentialUnlocks.release(holder.holderId);
    await service.credentialUnlocks.presentCredential(holder, CREDENTIAL_ONE, { verified: true });
    await notAsked(service);

    // Its panel session expires, with no sign-out.
    clock += 13 * 60 * 60 * 1000;
    vi.advanceTimersByTime(13 * 60 * 60 * 1000);
    expect(service.unlockedSessionFor(USER)).toBeNull();
    await notAsked(service);

    // Core restarts, more than once.
    for (let round = 0; round < 3; round += 1) {
      service.close();
      const restarted = boot(repos);
      await restarted.credentialUnlocks.presentCredential(holder, CREDENTIAL_ONE, { verified: true });
      await notAsked(restarted);
      restarted.close();
    }
  });

  it("through a credential rotating at each reconnect", async () => {
    const repos = repositories();
    const { service, keyId } = await withKey(repos);
    const holder = await unlockedBrowser(service, "one", CREDENTIAL_ONE);
    let credential = CREDENTIAL_ONE;
    for (let round = 0; round < 5; round += 1) {
      const next = `dummy-browser-credential-round-${round}-000000000000000`;
      await service.credentialUnlocks.rotateCredential({ holderId: holder.holderId, userId: USER, previousCredential: credential, nextCredential: next });
      await service.credentialUnlocks.confirmCredential({ holderId: holder.holderId, userId: USER, credentialDigest: secretKeySessionDigest(next) });
      service.credentialUnlocks.release(holder.holderId);
      await service.credentialUnlocks.presentCredential(holder, next, { verified: true });
      credential = next;
      expect(await release(service, handle(service, holder), keyId)).toBe(KEY_VALUE);
    }
  });

  it("a key added or rotated later reaches the browser with no second ask", async () => {
    const repos = repositories();
    const { service, keyId } = await withKey(repos);
    const holder = await unlockedBrowser(service, "one", CREDENTIAL_ONE);
    const added = await service.createKey({ name: "Added", value: "dummy-added-value", authorizationPassword: PASSWORD, createdBy: USER, nowMs: clock + 1 });
    await service.rotateKey({ id: keyId, value: "dummy-rotated-value", authorizationPassword: PASSWORD, actorUserId: USER });
    expect(await release(service, handle(service, holder), added.id)).toBe("dummy-added-value");
    expect(await release(service, handle(service, holder), keyId)).toBe("dummy-rotated-value");
  });
});

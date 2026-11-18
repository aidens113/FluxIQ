// A person's unlock lasts as long as the paired browser's credential: it survives
// a restart and a session ending with no password, and each lock event really
// locks. Provider-free and in memory; every secret here is a dummy.

import { createHash } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SecretKeyCredentialHolder, SecretKeyCredentialUnlockRecord } from "../../../types.ts";
import { SecretKeysService } from "../../service.ts";
import { unwrapCredentialUnlockPrivateKey } from "../crypto.ts";
import type { SecretKeyHolderVouch } from "../credential-unlocks.ts";
import { createMemoryRepository, WEAK_SCRYPT_PARAMETERS, type MemoryRepository, createPasswordSealedKey, rotatePasswordSealedKey } from "../../tests/secret-key-fixtures.ts";

const weakKdf = { testOnlyWeakParameters: WEAK_SCRYPT_PARAMETERS };
const PASSWORD = "dummy-password-owner";
const OTHER_PASSWORD = "dummy-password-other";
const KEY_VALUE = "dummy-provider-key-value-0001";
const USER = "user.owner";
const OTHER = "user.other";
const CREDENTIAL = "dummy-browser-credential-0000000000000000000001";
const NEXT_CREDENTIAL = "dummy-browser-credential-0000000000000000000002";
const OTHER_CREDENTIAL = "dummy-browser-credential-0000000000000000000003";
const DAY = 24 * 60 * 60 * 1000;
const NOW = 1_000_000;

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

/** A process: a restart is a new one of these over the same repositories. */
function boot(repos: Repositories, vouchForHolder: SecretKeyHolderVouch = () => true): SecretKeysService {
  return new SecretKeysService({ repository: repos.keys.repository, credentialUnlockRepository: repos.unlocks.repository, now: () => clock, passwordKdf: weakKdf, vouchForHolder });
}

/** The random id this process holds a paired client's unlock under. */
function handle(service: SecretKeysService, holder: SecretKeyCredentialHolder): string {
  return service.credentialUnlocks.heldHandleFor(holder.holderId);
}

/** The person's password, naming this browser: what lifts a lock. */
async function lift(service: SecretKeysService, holder: SecretKeyCredentialHolder, sessionId = "session.owner"): Promise<void> {
  await service.unlockSession({ sessionId, userId: holder.userId, authorizationPassword: PASSWORD, expiresAtMs: NOW + 12 * 60 * 60 * 1000, nowMs: clock });
}

function browser(id = "browser.one", options: { userId?: string; approvingSessionDigest?: string } = {}): SecretKeyCredentialHolder {
  return { holderKind: "paired-client", holderId: `paired-client:${id}`, userId: options.userId ?? USER, expiresAtMs: NOW + 30 * DAY, label: "Chrome", ...(options.approvingSessionDigest ? { approvingSessionDigest: options.approvingSessionDigest } : {}) };
}

function digest(sessionId: string): string {
  return createHash("sha256").update(sessionId, "utf8").digest("hex");
}

/** What a model call does: a one-use reveal against the held unlock. Null when it is refused. */
async function release(service: SecretKeysService, sessionId: string, keyId: string, userId = USER): Promise<string | null> {
  try {
    const authorization = await service.createSessionRevealAuthorization({ id: keyId, sessionId, userId, ttlMs: 10_000 });
    return (await service.revealKeyWithAuthorization({ authorizationId: authorization.authorizationId, id: keyId })).value;
  } catch {
    return null;
  }
}

/** Signs in, adds a key, and pairs a browser from that session, as a person does. */
async function paired(repos: Repositories): Promise<{ service: SecretKeysService; keyId: string; sessionId: string; holder: SecretKeyCredentialHolder }> {
  const service = boot(repos);
  const sessionId = "session.owner";
  const key = await createPasswordSealedKey(service, { name: "Model", value: KEY_VALUE, authorizationPassword: PASSWORD, createdBy: USER, nowMs: clock });
  await service.unlockSession({ sessionId, userId: USER, authorizationPassword: PASSWORD, expiresAtMs: NOW + 12 * 60 * 60 * 1000, nowMs: clock });
  const holder = browser("browser.one", { approvingSessionDigest: digest(sessionId) });
  await service.credentialUnlocks.presentCredential(holder, CREDENTIAL, { verified: true });
  await lift(service, holder, sessionId);
  return { service, keyId: key.id, sessionId, holder };
}

describe("a paired browser's unlock lasts as long as its credential", () => {
  it("survives a simulated Core restart, with no password", async () => {
    const repos = repositories();
    const { service, keyId, holder } = await paired(repos);
    expect(await release(service, handle(service, holder), keyId)).toBe(KEY_VALUE);
    service.close();

    const restarted = boot(repos);
    // The restart really dropped it: until the browser speaks, nothing is held.
    expect(await release(restarted, handle(restarted, holder), keyId)).toBeNull();
    await expect(restarted.credentialUnlocks.presentCredential(holder, CREDENTIAL, { verified: true })).resolves.toEqual({ unlockedKeyCount: 1 });
    expect(await release(restarted, handle(restarted, holder), keyId)).toBe(KEY_VALUE);
  });

  it("survives its approving session expiring", async () => {
    const repos = repositories();
    const { service, keyId, holder, sessionId } = await paired(repos);
    clock += 13 * 60 * 60 * 1000;
    vi.advanceTimersByTime(13 * 60 * 60 * 1000);
    expect(service.unlockedSessionFor(USER)).toBeNull();
    expect(await release(service, sessionId, keyId)).toBeNull();
    expect(await release(service, handle(service, holder), keyId)).toBe(KEY_VALUE);
  });

  it("holds across a credential lifetime longer than a timer can count, and ends at its true end", async () => {
    const repos = repositories();
    const { service, keyId } = await paired(repos);
    const holder: SecretKeyCredentialHolder = { ...browser("browser.sixty"), expiresAtMs: clock + 60 * DAY };
    await service.credentialUnlocks.presentCredential(holder, CREDENTIAL, { verified: true });
    await lift(service, holder);
    // A 60-day delay overflows setTimeout, which would otherwise fire at once.
    vi.advanceTimersByTime(1000);
    expect(await release(service, handle(service, holder), keyId)).toBe(KEY_VALUE);
    // Past the 24.8 days one timer can count, it is still held.
    clock += 59 * DAY;
    vi.advanceTimersByTime(59 * DAY);
    expect(service.holdingSession(handle(service, holder), USER)).toBe(handle(service, holder));
    clock += 1 * DAY;
    vi.advanceTimersByTime(1 * DAY);
    expect(service.holdingSession(handle(service, holder), USER)).toBeNull();
  });

  it("slides with its credential, keeping what it holds, and a call in flight is not cut", async () => {
    const repos = repositories();
    const { service, keyId, holder } = await paired(repos);
    const authorization = await service.createSessionRevealAuthorization({ id: keyId, sessionId: handle(service, holder), userId: USER, ttlMs: 10_000 });
    const later = { ...holder, expiresAtMs: holder.expiresAtMs + 60 * DAY };
    await service.credentialUnlocks.presentCredential(later, CREDENTIAL, { verified: true });
    await expect(service.revealKeyWithAuthorization({ authorizationId: authorization.authorizationId, id: keyId })).resolves.toMatchObject({ value: KEY_VALUE });
    expect((repos.unlocks.stored(holder.holderId) as unknown as SecretKeyCredentialUnlockRecord).expiresAtMs).toBe(later.expiresAtMs);
    clock = holder.expiresAtMs + 1;
    vi.advanceTimersByTime(30 * DAY + 1);
    expect(service.holdingSession(handle(service, holder), USER)).toBe(handle(service, holder));
  });

  it("keeps opening with the old credential until the new one is confirmed, so a lost reply strands nobody", async () => {
    const repos = repositories();
    const { service, keyId, holder } = await paired(repos);
    await service.credentialUnlocks.rotateCredential({ holderId: holder.holderId, userId: USER, previousCredential: CREDENTIAL, nextCredential: NEXT_CREDENTIAL });
    await service.credentialUnlocks.presentCredential(holder, NEXT_CREDENTIAL, { verified: true });
    service.close();
    const restarted = boot(repos);
    // The reply carrying the new one never arrived: the browser comes back with the old one, and rotates again.
    await restarted.credentialUnlocks.presentCredential(holder, CREDENTIAL, { verified: true });
    expect(await release(restarted, handle(restarted, holder), keyId)).toBe(KEY_VALUE);
    await expect(restarted.credentialUnlocks.rotateCredential({ holderId: holder.holderId, userId: USER, previousCredential: CREDENTIAL, nextCredential: OTHER_CREDENTIAL })).resolves.toBe(true);
    const stored = repos.unlocks.stored(holder.holderId) as unknown as SecretKeyCredentialUnlockRecord;
    const binding = { holderId: holder.holderId, userId: USER };
    expect(stored.pending).toBeDefined();
    // The reply that never arrived opens nothing any more.
    expect(unwrapCredentialUnlockPrivateKey(stored.wrap, NEXT_CREDENTIAL, binding)).toBeNull();
    expect(unwrapCredentialUnlockPrivateKey(stored.pending!.wrap, NEXT_CREDENTIAL, binding)).toBeNull();
  });

  it("follows the credential through a rotation, and the old credential opens nothing once the new one is confirmed", async () => {
    const repos = repositories();
    const { service, keyId, holder } = await paired(repos);
    await expect(service.credentialUnlocks.rotateCredential({ holderId: holder.holderId, userId: USER, previousCredential: CREDENTIAL, nextCredential: NEXT_CREDENTIAL })).resolves.toBe(true);
    await service.credentialUnlocks.presentCredential(holder, NEXT_CREDENTIAL, { verified: true });
    await service.credentialUnlocks.confirmCredential({ holderId: holder.holderId, userId: USER, credentialDigest: digest(NEXT_CREDENTIAL) });
    service.close();

    const restarted = boot(repos);
    await expect(restarted.credentialUnlocks.presentCredential(holder, CREDENTIAL)).resolves.toEqual({ unlockedKeyCount: 0 });
    expect(await release(restarted, handle(restarted, holder), keyId)).toBeNull();
    await restarted.credentialUnlocks.presentCredential(holder, NEXT_CREDENTIAL, { verified: true });
    expect(await release(restarted, handle(restarted, holder), keyId)).toBe(KEY_VALUE);
  });

  it("is safe if the process dies between the wrap and the new digest: the credential Core still accepts opens it", async () => {
    const repos = repositories();
    const { service, keyId, holder } = await paired(repos);
    await service.credentialUnlocks.rotateCredential({ holderId: holder.holderId, userId: USER, previousCredential: CREDENTIAL, nextCredential: NEXT_CREDENTIAL });
    service.close();
    const restarted = boot(repos);
    await restarted.credentialUnlocks.presentCredential(holder, CREDENTIAL, { verified: true });
    expect(await release(restarted, handle(restarted, holder), keyId)).toBe(KEY_VALUE);
    // The generation for a credential nobody ever received goes with the next rotation.
    await restarted.credentialUnlocks.rotateCredential({ holderId: holder.holderId, userId: USER, previousCredential: CREDENTIAL, nextCredential: OTHER_CREDENTIAL });
    const stored = repos.unlocks.stored(holder.holderId) as unknown as SecretKeyCredentialUnlockRecord;
    expect(unwrapCredentialUnlockPrivateKey(stored.pending!.wrap, NEXT_CREDENTIAL, { holderId: holder.holderId, userId: USER })).toBeNull();
  });

  it("reaches a key the person adds later, while the browser is away, with no credential present", async () => {
    const repos = repositories();
    const { service, holder } = await paired(repos);
    service.credentialUnlocks.release(holder.holderId);
    const later = await createPasswordSealedKey(service, { name: "Later", value: "dummy-later-key-value", authorizationPassword: PASSWORD, createdBy: USER, nowMs: clock + 1 });
    service.close();

    const restarted = boot(repos);
    await restarted.credentialUnlocks.presentCredential(holder, CREDENTIAL, { verified: true });
    expect(await release(restarted, handle(restarted, holder), later.id)).toBe("dummy-later-key-value");
  });

  it("leaves memory when the client goes away, and comes back with its credential", async () => {
    const repos = repositories();
    const { service, keyId, holder } = await paired(repos);
    service.credentialUnlocks.release(holder.holderId);
    expect(await release(service, handle(service, holder), keyId)).toBeNull();
    await service.credentialUnlocks.presentCredential(holder, CREDENTIAL, { verified: true });
    expect(await release(service, handle(service, holder), keyId)).toBe(KEY_VALUE);
  });

  it("keeps working after a panel edit, which leaves the seal as it is", async () => {
    const repos = repositories();
    const { service, keyId, holder } = await paired(repos);
    await service.updateKey({ id: keyId, name: "Renamed" });
    await service.credentialUnlocks.presentCredential(holder, CREDENTIAL, { verified: true });
    expect(await release(service, handle(service, holder), keyId)).toBe(KEY_VALUE);
  });
});

describe("a signed-in panel session's unlock across a restart", () => {
  it("comes back from its own cookie, with no password", async () => {
    const repos = repositories();
    const { service, keyId, sessionId } = await paired(repos);
    service.close();
    const restarted = boot(repos);
    expect(restarted.unlockedSessionFor(USER)).toBeNull();
    await restarted.credentialUnlocks.presentPanelSession({ sessionId, userId: USER, expiresAtMs: NOW + 12 * 60 * 60 * 1000 });
    expect(restarted.unlockedSessionFor(USER)).toBe(sessionId);
    expect(await release(restarted, sessionId, keyId)).toBe(KEY_VALUE);
  });

  it("stores no raw session id", async () => {
    const repos = repositories();
    const { sessionId } = await paired(repos);
    const row = repos.unlocks.storedText(`panel-session:${digest(sessionId)}`) ?? "";
    expect(row).not.toBe("");
    expect(row).not.toContain(sessionId);
  });

  it("does not come back after that session's sign-out", async () => {
    const repos = repositories();
    const { service, sessionId, keyId } = await paired(repos);
    await service.credentialUnlocks.sessionEnded({ digest: digest(sessionId), revokerUserId: USER, administrator: false });
    service.revokeSessionUnlock(sessionId, { userId: USER, administrator: false });
    service.close();
    const restarted = boot(repos);
    await restarted.credentialUnlocks.presentPanelSession({ sessionId, userId: USER, expiresAtMs: NOW + 12 * 60 * 60 * 1000 });
    expect(await release(restarted, sessionId, keyId)).toBeNull();
  });
});

describe("each lock event really locks, and a later message cannot unlock", () => {
  async function stillLocked(repos: Repositories, service: SecretKeysService, holder: SecretKeyCredentialHolder, keyId: string): Promise<void> {
    // The same process, and a restart: a later message from that browser opens nothing.
    expect(await release(service, handle(service, holder), keyId)).toBeNull();
    await expect(service.credentialUnlocks.presentCredential(holder, CREDENTIAL, { verified: true })).resolves.toEqual({ unlockedKeyCount: 0 });
    expect(await release(service, handle(service, holder), keyId)).toBeNull();
    service.close();
    const restarted = boot(repos);
    await expect(restarted.credentialUnlocks.presentCredential(holder, CREDENTIAL, { verified: true })).resolves.toEqual({ unlockedKeyCount: 0 });
    expect(await release(restarted, handle(restarted, holder), keyId)).toBeNull();
  }

  it("signing out of the session that approved it, preserving independent credential access", async () => {
    const repos = repositories();
    const { service, keyId, holder, sessionId } = await paired(repos);
    await service.credentialUnlocks.sessionEnded({ digest: digest(sessionId), revokerUserId: USER, administrator: false, liveSessionDigests: new Set() });
    expect(await release(service, handle(service, holder), keyId)).toBe(KEY_VALUE);
    service.close();
    const restarted = boot(repos);
    await restarted.credentialUnlocks.presentCredential(holder, CREDENTIAL, { verified: true });
    expect(await release(restarted, handle(restarted, holder), keyId)).toBe(KEY_VALUE);
  });

  it("an already-ended approval session, preserving independent credential access", async () => {
    const repos = repositories();
    const { service, keyId, holder, sessionId } = await paired(repos);
    await service.credentialUnlocks.sessionEnded({ digest: digest(sessionId), revokerUserId: USER, administrator: false, liveSessionDigests: new Set() });
    expect(await release(service, handle(service, holder), keyId)).toBe(KEY_VALUE);
    service.close();
    const restarted = boot(repos);
    await restarted.credentialUnlocks.presentCredential(holder, CREDENTIAL, { verified: true });
    expect(await release(restarted, handle(restarted, holder), keyId)).toBe(KEY_VALUE);
  });

  it("a sign-out in another browser does not lock this one while the session that approved it lives", async () => {
    const repos = repositories();
    const { service, keyId, holder, sessionId } = await paired(repos);
    await service.credentialUnlocks.sessionEnded({ digest: digest("session.elsewhere"), revokerUserId: USER, administrator: false, liveSessionDigests: new Set([digest(sessionId)]) });
    expect(await release(service, handle(service, holder), keyId)).toBe(KEY_VALUE);
  });

  it("a session expiring is not a sign-out", async () => {
    const repos = repositories();
    const { service, keyId, holder } = await paired(repos);
    clock += 13 * 60 * 60 * 1000;
    vi.advanceTimersByTime(13 * 60 * 60 * 1000);
    service.close();
    const restarted = boot(repos);
    await restarted.credentialUnlocks.presentCredential(holder, CREDENTIAL, { verified: true });
    expect(await release(restarted, handle(restarted, holder), keyId)).toBe(KEY_VALUE);
  });

  it("forgetting the pairing", async () => {
    const repos = repositories();
    const { service, keyId, holder } = await paired(repos);
    await service.credentialUnlocks.forget(holder.holderId);
    expect(await release(service, handle(service, holder), keyId)).toBeNull();
    expect(repos.unlocks.storedText(holder.holderId)).toBeUndefined();
    // Nothing is left to open: a credential that was stolen earlier finds an empty holder.
    await expect(service.credentialUnlocks.presentCredential(holder, CREDENTIAL)).resolves.toEqual({ unlockedKeyCount: 0 });
  });

  it('an administrator ending only the approving panel session preserves independent clients', async () => {
    const repos = repositories();
    const { service, keyId, holder, sessionId } = await paired(repos);
    await service.credentialUnlocks.sessionEnded({ digest: digest(sessionId), revokerUserId: 'user.admin', administrator: true, liveSessionDigests: new Set() });
    expect(await release(service, handle(service, holder), keyId)).toBe(KEY_VALUE);
  });

  it("an administrator's revoke of someone else's session leaves browsers it did not approve", async () => {
    const repos = repositories();
    const { service, keyId, holder, sessionId } = await paired(repos);
    await service.credentialUnlocks.sessionEnded({ digest: digest("session.other"), revokerUserId: "user.admin", administrator: true, liveSessionDigests: new Set([digest(sessionId)]) });
    expect(await release(service, handle(service, holder), keyId)).toBe(KEY_VALUE);
  });

  it("every session of the person being revoked, even with no raw id known", async () => {
    const repos = repositories();
    const { service, keyId, holder } = await paired(repos);
    await service.credentialUnlocks.sessionEnded({ digest: null, wholeUserId: USER, revokerUserId: USER, administrator: false });
    await stillLocked(repos, service, holder, keyId);
  });

  it("deleting the key", async () => {
    const repos = repositories();
    const { service, keyId, holder } = await paired(repos);
    await service.deleteKey(keyId);
    // Gone at once, not only when the browser next speaks.
    expect(repos.unlocks.storedText(holder.holderId)).not.toContain(keyId);
    expect(await release(service, handle(service, holder), keyId)).toBeNull();
    await service.credentialUnlocks.presentCredential(holder, CREDENTIAL, { verified: true });
    expect(await release(service, handle(service, holder), keyId)).toBeNull();
    expect(repos.unlocks.storedText(holder.holderId)).not.toContain(keyId);
  });

  it("someone else rotating the key: the old box cannot open the new seal", async () => {
    const repos = repositories();
    const { service, keyId, holder } = await paired(repos);
    await rotatePasswordSealedKey(service, { id: keyId, value: "dummy-rotated-by-admin", authorizationPassword: OTHER_PASSWORD, actorUserId: OTHER });
    await stillLocked(repos, service, holder, keyId);
  });

  it("a box that outlived its seal, as from an old backup, is not held and is dropped", async () => {
    const repos = repositories();
    const { service, keyId, holder } = await paired(repos);
    const before = repos.unlocks.stored(holder.holderId);
    await rotatePasswordSealedKey(service, { id: keyId, value: "dummy-rotated-by-admin", authorizationPassword: OTHER_PASSWORD, actorUserId: OTHER });
    service.close();
    repos.unlocks.replace(holder.holderId, before);
    const restarted = boot(repos);
    await expect(restarted.credentialUnlocks.presentCredential(holder, CREDENTIAL, { verified: true })).resolves.toEqual({ unlockedKeyCount: 0 });
    expect((repos.unlocks.stored(holder.holderId) as unknown as SecretKeyCredentialUnlockRecord).boxes).toEqual({});
  });

  it("the person rotating the key, proving their password: the old value and its box are gone, and their browser reaches only the new value", async () => {
    const repos = repositories();
    const { service, keyId, holder } = await paired(repos);
    const before = (repos.unlocks.stored(holder.holderId) as unknown as SecretKeyCredentialUnlockRecord).boxes[keyId];
    await rotatePasswordSealedKey(service, { id: keyId, value: "dummy-rotated-by-owner", authorizationPassword: PASSWORD, actorUserId: USER });
    const after = (repos.unlocks.stored(holder.holderId) as unknown as SecretKeyCredentialUnlockRecord).boxes[keyId];
    expect(after).toBeDefined();
    expect(after).not.toEqual(before);
    expect(await release(service, handle(service, holder), keyId)).toBe("dummy-rotated-by-owner");
    service.close();
    const restarted = boot(repos);
    await restarted.credentialUnlocks.presentCredential(holder, CREDENTIAL, { verified: true });
    expect(await release(restarted, handle(restarted, holder), keyId)).toBe("dummy-rotated-by-owner");
  });

  it("a password reset nobody proved the old password for", async () => {
    const repos = repositories();
    const { service, keyId, holder } = await paired(repos);
    await service.credentialUnlocks.lockPerson(USER, "password_reset");
    await stillLocked(repos, service, holder, keyId);
  });

  it("a password change the person proved re-wraps: the browser that session approved keeps its key under the new seal", async () => {
    const repos = repositories();
    const { service, keyId, holder, sessionId } = await paired(repos);
    const { changeId } = await service.prepareCredentialChange({ userId: USER, currentPassword: PASSWORD, nextPassword: "dummy-password-next", actorSessionId: sessionId });
    await service.commitCredentialChange(changeId);
    service.close();
    const restarted = boot(repos);
    await restarted.credentialUnlocks.presentCredential(holder, CREDENTIAL, { verified: true });
    expect(await release(restarted, handle(restarted, holder), keyId)).toBe(KEY_VALUE);
  });

  it('normal sign-in requires no client lift and preserves existing credential access', async () => {
    const { service, keyId, holder, sessionId } = await paired(repositories());
    await service.credentialUnlocks.sessionEnded({ digest: digest(sessionId), revokerUserId: USER, administrator: false, liveSessionDigests: new Set() });
    await service.unlockSession({ sessionId: 'session.elsewhere', userId: USER, authorizationPassword: PASSWORD, expiresAtMs: NOW + DAY, nowMs: clock });
    expect(await release(service, handle(service, holder), keyId)).toBe(KEY_VALUE);
    expect(await service.snapshotFor({ userId: USER, sessionId: null })).not.toHaveProperty("lockedClients");
  });

  it('a wrong unrelated password proof changes no independent credential material', async () => {
    const { service, keyId, holder, sessionId } = await paired(repositories());
    await service.credentialUnlocks.sessionEnded({ digest: digest(sessionId), revokerUserId: USER, administrator: false, liveSessionDigests: new Set() });
    const proof = await service.unlockSession({ sessionId: 'session.other', userId: USER, authorizationPassword: 'dummy-wrong-password', expiresAtMs: NOW + DAY, nowMs: clock });
    expect(proof.unlockedKeyCount).toBe(0);
    expect(await release(service, handle(service, holder), keyId)).toBe(KEY_VALUE);
  });
});

describe("what an attacker would need", () => {
  it("the store alone cannot open a key: no plaintext, no credential, and its digest opens nothing", async () => {
    const repos = repositories();
    const { keyId, holder, sessionId } = await paired(repos);
    const rows = [repos.keys.storedText(keyId) ?? "", repos.unlocks.storedText(holder.holderId) ?? "", repos.unlocks.storedText(`panel-session:${digest(sessionId)}`) ?? ""].join("\n");
    expect(rows).not.toBe("\n\n");
    for (const secret of [KEY_VALUE, PASSWORD, CREDENTIAL, sessionId]) {
      expect(rows).not.toContain(secret);
      expect(rows).not.toContain(Buffer.from(secret, "utf8").toString("base64url"));
    }
    const stored = repos.unlocks.stored(holder.holderId) as unknown as SecretKeyCredentialUnlockRecord;
    const binding = { holderId: holder.holderId, userId: USER };
    // Core stores a credential only as its SHA-256; that digest is no key.
    const credentialDigest = createHash("sha256").update(CREDENTIAL, "utf8").digest("hex");
    for (const guess of [credentialDigest, "", holder.holderId, stored.publicKey]) {
      expect(unwrapCredentialUnlockPrivateKey(stored.wrap, guess, binding)).toBeNull();
    }
    const opened = unwrapCredentialUnlockPrivateKey(stored.wrap, CREDENTIAL, binding);
    expect(opened).not.toBeNull();
    opened?.fill(0);
  });

  it("another browser's credential cannot open it, and trying leaves the right one working", async () => {
    const repos = repositories();
    const { service, keyId, holder } = await paired(repos);
    service.close();
    const restarted = boot(repos);
    await expect(restarted.credentialUnlocks.presentCredential(holder, OTHER_CREDENTIAL)).resolves.toEqual({ unlockedKeyCount: 0 });
    expect(await release(restarted, handle(restarted, holder), keyId)).toBeNull();
    await restarted.credentialUnlocks.presentCredential(holder, CREDENTIAL, { verified: true });
    expect(await release(restarted, handle(restarted, holder), keyId)).toBe(KEY_VALUE);
  });

  it("a verified credential the record cannot open (a rotation whose write failed) re-keys it and opens nothing, and a lock on it stays", async () => {
    const repos = repositories();
    const { service, keyId, holder, sessionId } = await paired(repos);
    await service.credentialUnlocks.sessionEnded({ digest: digest(sessionId), revokerUserId: USER, administrator: false, liveSessionDigests: new Set() });
    service.close();
    const restarted = boot(repos);
    await expect(restarted.credentialUnlocks.presentCredential(holder, NEXT_CREDENTIAL, { verified: true })).resolves.toEqual({ unlockedKeyCount: 0 });
    expect(await release(restarted, handle(restarted, holder), keyId)).toBeNull();
    expect(await restarted.snapshotFor({ userId: USER, sessionId: null })).not.toHaveProperty("lockedClients");
    const stored = repos.unlocks.stored(holder.holderId) as unknown as SecretKeyCredentialUnlockRecord;
    expect(stored.boxes).toEqual({});
    expect(stored.pending).toBeUndefined();
  });

  it("another person's credential cannot open it: their browser sees only their own keys, even if it names this holder", async () => {
    const repos = repositories();
    const { service, keyId, holder } = await paired(repos);
    const other = browser("browser.two", { userId: OTHER });
    await expect(service.credentialUnlocks.presentCredential(other, OTHER_CREDENTIAL, { verified: true })).resolves.toEqual({ unlockedKeyCount: 0 });
    expect(await release(service, handle(service, other), keyId, OTHER)).toBeNull();
    expect(await release(service, handle(service, holder), keyId, OTHER)).toBeNull();
    await expect(service.credentialUnlocks.presentCredential({ ...holder, userId: OTHER }, OTHER_CREDENTIAL)).resolves.toEqual({ unlockedKeyCount: 0 });
    expect(await release(service, handle(service, holder), keyId)).toBe(KEY_VALUE);
  });

  it("a malformed stored field fails closed, and its message quotes nothing", async () => {
    const repos = repositories();
    const { service, keyId, holder } = await paired(repos);
    service.close();
    const stored = repos.unlocks.stored(holder.holderId) as unknown as SecretKeyCredentialUnlockRecord;
    repos.unlocks.replace(holder.holderId, { ...stored, wrap: { ...stored.wrap, tag: "AA" } });
    const restarted = boot(repos);
    await expect(restarted.credentialUnlocks.presentCredential(holder, CREDENTIAL, { verified: true })).rejects.toThrow("A stored credential unlock could not be read.");
    expect(await release(restarted, handle(restarted, holder), keyId)).toBeNull();
  });

  it("a wrap or a box moved onto another holder does not open there", async () => {
    const repos = repositories();
    const { service, keyId, holder } = await paired(repos);
    const victim = repos.unlocks.stored(holder.holderId) as unknown as SecretKeyCredentialUnlockRecord;
    const attacker = browser("browser.attacker");
    await service.credentialUnlocks.presentCredential(attacker, OTHER_CREDENTIAL, { verified: true });
    service.close();
    const stored = repos.unlocks.stored(attacker.holderId) as unknown as SecretKeyCredentialUnlockRecord;
    // The attacker can write the store, and moves the victim's box and wrap onto a holder whose credential they do know.
    repos.unlocks.replace(attacker.holderId, { ...stored, boxes: victim.boxes });
    const restarted = boot(repos);
    await expect(restarted.credentialUnlocks.presentCredential(attacker, OTHER_CREDENTIAL, { verified: true })).resolves.toEqual({ unlockedKeyCount: 0 });
    expect(await release(restarted, handle(restarted, attacker), keyId)).toBeNull();
  });
});

describe("nothing secret reaches logs or errors", () => {
  it("across pairing, rotation, wrong credentials, locks and failed reads", async () => {
    const written: string[] = [];
    for (const method of ["log", "info", "warn", "error", "debug"] as const) {
      vi.spyOn(console, method).mockImplementation((...args: unknown[]) => { written.push(args.map((arg) => (arg instanceof Error ? `${arg.message} ${arg.stack ?? ""}` : typeof arg === "string" ? arg : JSON.stringify(arg))).join(" ")); });
    }
    const errors: unknown[] = [];
    const repos = repositories();
    const { service, keyId, holder, sessionId } = await paired(repos);
    await service.credentialUnlocks.rotateCredential({ holderId: holder.holderId, userId: USER, previousCredential: "dummy-wrong-credential", nextCredential: NEXT_CREDENTIAL }).catch((error: unknown) => errors.push(error));
    await service.credentialUnlocks.presentCredential(holder, OTHER_CREDENTIAL).catch((error: unknown) => errors.push(error));
    await service.createSessionRevealAuthorization({ id: keyId, sessionId: "session.absent", userId: USER }).catch((error: unknown) => errors.push(error));
    await service.credentialUnlocks.sessionEnded({ digest: digest(sessionId), revokerUserId: USER, administrator: false, liveSessionDigests: new Set() }).catch((error: unknown) => errors.push(error));
    await service.createSessionRevealAuthorization({ id: keyId, sessionId: handle(service, holder), userId: USER }).catch((error: unknown) => errors.push(error));
    const said = [...written, ...errors.map((error) => (error instanceof Error ? `${error.message} ${error.stack ?? ""} ${String(error.cause ?? "")}` : String(error)))].join("\n");
    expect(errors.length).toBeGreaterThan(0);
    for (const secret of [KEY_VALUE, PASSWORD, CREDENTIAL, NEXT_CREDENTIAL, OTHER_CREDENTIAL, sessionId]) expect(said).not.toContain(secret);
    vi.restoreAllMocks();
  });
});

describe('saved-key availability without connection locks', () => {
    it('reports exact legacy recovery and own held availability without affecting foreign metadata', async () => {
      const { service, keyId, holder } = await paired(repositories());
      const foreign = await createPasswordSealedKey(service, { name: 'Foreign', value: 'dummy-other', authorizationPassword: OTHER_PASSWORD, createdBy: OTHER });
      const own = await service.snapshotFor({ userId: USER, sessionId: handle(service, holder) });
      expect(own.keys.find(key => key.id === keyId)?.availability).toEqual({ state: 'available' });
      expect(own.keys.find(key => key.id === foreign.id)).not.toHaveProperty('availability');
      const unavailable = await service.snapshotFor({ userId: USER, sessionId: null });
      expect(unavailable.keys.find(key => key.id === keyId)?.availability).toEqual({ state: 'unavailable', code: 'legacy_recovery_required' });
      expect(unavailable).not.toHaveProperty('lockedClients');
      expect(unavailable).not.toHaveProperty('unlockTicket');
      expect(unavailable.keys.find(key => key.id === keyId)).not.toHaveProperty('unlocked');
    });
  });

describe('historical unlock metadata compatibility', () => {
    it('never produces a new first-unlock gate or ticket', async () => {
      const { service, holder } = await paired(repositories());
      expect(await service.snapshotFor({ userId: USER, sessionId: null, holderId: holder.holderId })).not.toHaveProperty("unlockTicket");
      expect(await service.snapshotFor({ userId: USER, sessionId: null })).not.toHaveProperty("lockedClients");
    });
  });

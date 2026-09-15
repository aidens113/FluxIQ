// Identity Access credential custody: version 2 seals and PHC hashes, upgrades
// from version 1 records, one derivation per operation, PIN rehash, session
// digests, and the credential-change port. Derivations run at the test-only
// N=2^10; version 1 fixtures use the legacy N=2^14. Every password and PIN here
// is a dummy value.

import { createCipheriv, createDecipheriv, createHash, randomBytes, scryptSync } from "node:crypto";
import { describe, expect, it } from "vitest";
import type { JsonObject } from "../../../../core/index.ts";
import { deriveScryptKey, type DeriveScryptKeyFn, type ScryptParameters } from "../../../_shared/password-kdf/index.ts";
import type { RecordEnvelope, Repository } from "../../../database-manager/index.ts";
import type { IdentityCredentialChange, IdentityCredentialChangeSubscriber, UserCredential } from "../../types.ts";
import { IdentityAccessService } from "../service.ts";
import { digestSessionId } from "../session-digest.ts";

const WEAK: ScryptParameters = { N: 2 ** 10, r: 8, p: 1, keyLength: 32 };
const LEGACY_N = 2 ** 14;
const PASSWORD = "dummy-password";
const NEW_PASSWORD = "dummy-password-changed";
const WRONG_PASSWORD = "dummy-password-wrong";
const PIN = "4321";
const WRONG_PIN = "9876";
const INVALID = "Invalid username or credentials";
const PHC_AT_WEAK = /^\$scrypt\$ln=10,r=8,p=1\$/;
const LEGACY_HASH = /^scrypt:/;

type StoredSeal = { version: number; algorithm: string; kdf: string; salt: string; iv: string; tag: string; ciphertext: string; kdfParams?: ScryptParameters };

class MemoryIdentityRepository implements Repository {
  readonly records = new Map<string, RecordEnvelope>();
  readonly puts: string[] = [];
  failPutsFor: string | undefined;

  async list(): Promise<RecordEnvelope[]> {
    return [...this.records.values()].map((item) => copy(item));
  }

  async get(id: string): Promise<RecordEnvelope | null> {
    const item = this.records.get(id);
    return item ? copy(item) : null;
  }

  async put(item: RecordEnvelope): Promise<RecordEnvelope> {
    if (item.id === this.failPutsFor) throw new Error("store unavailable");
    this.puts.push(item.id);
    this.records.set(item.id, copy(item));
    return item;
  }

  async delete(id: string): Promise<boolean> {
    return this.records.delete(id);
  }
}

describe("IdentityAccessService credential seals", () => {
  it("seals new credentials as version 2 with recorded parameters and PHC hashes", async () => {
    const repository = new MemoryIdentityRepository();
    await createService(repository).upsertUser({ id: "user.one", username: "user-one", displayName: "User One", roleId: "admin", password: PASSWORD, pin: PIN });

    const sealed = storedSeal(repository, "user.one");
    expect(sealed).toMatchObject({ version: 2, algorithm: "aes-256-gcm", kdf: "scrypt", kdfParams: WEAK });
    expect(Buffer.from(sealed.salt, "base64url")).toHaveLength(16);
    const inner = openTestSeal(sealed, PASSWORD);
    expect(inner.passwordHash).toMatch(PHC_AT_WEAK);
    expect(inner.pinHash).toMatch(PHC_AT_WEAK);
  });

  it("logs in against a version 1 seal with legacy hashes and re-seals it as version 2 with a new salt", async () => {
    const repository = new MemoryIdentityRepository();
    const v1 = seedLegacyV1User(repository);

    await expect(createService(repository).authenticate({ username: "legacy", password: PASSWORD })).resolves.toMatchObject({ user: { id: "legacy" } });

    const upgraded = storedSeal(repository, "legacy");
    expect(upgraded).toMatchObject({ version: 2, kdfParams: WEAK });
    expect(upgraded.salt).not.toBe(v1.salt);
    const inner = openTestSeal(upgraded, PASSWORD);
    expect(inner.passwordHash).toMatch(PHC_AT_WEAK);
    expect(inner.pinHash).toMatch(LEGACY_HASH);
    await expect(createService(repository).authenticate({ username: "legacy", password: PASSWORD })).resolves.toMatchObject({ user: { id: "legacy" } });
  });

  it("leaves a version 1 record untouched after a wrong password", async () => {
    const repository = new MemoryIdentityRepository();
    seedLegacyV1User(repository);
    const before = JSON.stringify(repository.records.get("credential:legacy"));

    await expect(createService(repository).authenticate({ username: "legacy", password: WRONG_PASSWORD })).rejects.toThrow(INVALID);

    expect(repository.puts).toEqual([]);
    expect(JSON.stringify(repository.records.get("credential:legacy"))).toBe(before);
  });

  it("fails closed without deriving when a stored version 2 seal names parameters outside the allowlist", async () => {
    const repository = new MemoryIdentityRepository();
    await createService(repository).upsertUser({ id: "user.one", username: "user-one", displayName: "User One", roleId: "admin", password: PASSWORD });
    const sealed = repository.records.get("credential:user.one")?.data.sealed as unknown as { kdfParams: ScryptParameters };
    sealed.kdfParams = { N: 2 ** 30, r: 8, p: 1, keyLength: 32 };
    const counting = countingKdf();

    await expect(createService(repository, counting.passwordKdf).authenticate({ username: "user-one", password: PASSWORD })).rejects.toThrow(INVALID);

    expect(counting.parameters).toEqual([]);
  });

  it("refuses password KDF parameters outside the test-only weak range at construction", () => {
    const refused: ScryptParameters[] = [
      { N: 2 ** 17, r: 8, p: 1, keyLength: 32 },
      { N: 2 ** 20, r: 8, p: 1, keyLength: 32 },
      { N: 1000, r: 8, p: 1, keyLength: 32 },
      { N: 2 ** 10, r: 4, p: 1, keyLength: 32 }
    ];
    for (const testOnlyWeakParameters of refused) {
      expect(() => new IdentityAccessService({ passwordKdf: { testOnlyWeakParameters } })).toThrow(RangeError);
    }
  });

  it("zeroes derived keys it does not keep", async () => {
    const repository = new MemoryIdentityRepository();
    seedLegacyV1User(repository);
    const counting = countingKdf();
    const identity = createService(repository, counting.passwordKdf);

    await expect(identity.authenticate({ username: "legacy", password: WRONG_PASSWORD })).rejects.toThrow(INVALID);
    expect(isZero(counting.keys[0])).toBe(true);

    await identity.authenticate({ username: "legacy", password: PASSWORD });
    // keys[1] opened the version 1 seal, keys[2] rehashed the password, keys[3] is the new held key.
    expect(isZero(counting.keys[1])).toBe(true);
    expect(isZero(counting.keys[3])).toBe(false);

    await identity.setPassword("legacy", NEW_PASSWORD);
    expect(isZero(counting.keys[3])).toBe(true);
  });
});

describe("IdentityAccessService derivations per operation", () => {
  it("spends one derivation per login and per password check, plus one for a configured PIN", async () => {
    const repository = new MemoryIdentityRepository();
    await createService(repository).upsertUser({ id: "user.one", username: "user-one", displayName: "User One", roleId: "admin", password: PASSWORD });
    const saltBefore = storedSeal(repository, "user.one").salt;
    const counting = countingKdf();
    const identity = createService(repository, counting.passwordKdf);

    const login = await identity.authenticate({ username: "user-one", password: PASSWORD });
    expect(counting.parameters).toHaveLength(1);
    expect(storedSeal(repository, "user.one").salt).toBe(saltBefore);

    await identity.authenticate({ username: "user-one", password: PASSWORD });
    expect(counting.parameters).toHaveLength(2);

    await identity.authorizeSessionCredentials({ sessionId: login.session.id, password: PASSWORD, pin: undefined, totp: undefined });
    expect(counting.parameters).toHaveLength(3);

    await identity.setPin("user.one", PIN);
    const beforeGate = counting.parameters.length;
    await identity.authorizeSessionCredentials({ sessionId: login.session.id, password: PASSWORD, pin: PIN, totp: undefined });
    expect(counting.parameters.length - beforeGate).toBe(2);
  });

  it("runs one dummy derivation for an unknown, disabled, or password-less username", async () => {
    const repository = new MemoryIdentityRepository();
    seedUser(repository, "disabled", { credential: { userId: "disabled", passwordHash: legacyTestHashSecret(PASSWORD), updatedAtMs: 1 } }, false);
    await createService(repository).upsertUser({ id: "no.password", username: "no-password", displayName: "No Password", roleId: "admin" });
    const counting = countingKdf();
    const identity = createService(repository, counting.passwordKdf);

    await expect(identity.authenticate({ username: "nobody", password: PASSWORD })).rejects.toThrow(INVALID);
    expect(counting.parameters).toEqual([WEAK.N]);
    await expect(identity.authenticate({ username: "disabled", password: PASSWORD })).rejects.toThrow(INVALID);
    expect(counting.parameters).toEqual([WEAK.N, WEAK.N]);
    await expect(identity.authenticate({ username: "no-password", password: PASSWORD })).rejects.toThrow(INVALID);
    expect(counting.parameters).toEqual([WEAK.N, WEAK.N, WEAK.N]);
    expect(counting.keys.every((key) => isZero(key))).toBe(true);
  });

  it("re-seals once when two cold logins for the same version 1 user race", async () => {
    const repository = new MemoryIdentityRepository();
    seedLegacyV1User(repository);
    const counting = countingKdf();
    const identity = createService(repository, counting.passwordKdf);

    const [first, second] = await Promise.all([
      identity.authenticate({ username: "legacy", password: PASSWORD }),
      identity.authenticate({ username: "legacy", password: PASSWORD })
    ]);

    expect(first.session.id).not.toBe(second.session.id);
    // One version 1 open, one rehash, one new-salt key; the second login verifies the credential the first left held.
    expect(counting.parameters).toEqual([LEGACY_N, WEAK.N, WEAK.N, WEAK.N]);
    expect(storedSeal(repository, "legacy")).toMatchObject({ version: 2 });
    await expect(createService(repository).authenticate({ username: "legacy", password: PASSWORD })).resolves.toMatchObject({ user: { id: "legacy" } });
  });
});

describe("IdentityAccessService PINs", () => {
  it("rehashes a legacy PIN after a correct check on an unlocked credential, and never after a wrong one", async () => {
    const repository = new MemoryIdentityRepository();
    seedLegacyV1User(repository);
    const identity = createService(repository);
    const login = await identity.authenticate({ username: "legacy", password: PASSWORD });

    const putsBefore = repository.puts.length;
    await expect(identity.authorizeSessionPin({ sessionId: login.session.id, pin: WRONG_PIN })).rejects.toThrow("Invalid PIN");
    expect(repository.puts).toHaveLength(putsBefore);
    expect(openTestSeal(storedSeal(repository, "legacy"), PASSWORD).pinHash).toMatch(LEGACY_HASH);

    await expect(identity.authorizeSessionPin({ sessionId: login.session.id, pin: PIN })).resolves.toMatchObject({ id: "legacy" });
    expect(openTestSeal(storedSeal(repository, "legacy"), PASSWORD).pinHash).toMatch(PHC_AT_WEAK);

    const restarted = createService(repository);
    const relogin = await restarted.authenticate({ username: "legacy", password: PASSWORD });
    await expect(restarted.authorizeSessionPin({ sessionId: relogin.session.id, pin: PIN })).resolves.toMatchObject({ id: "legacy" });
  });

  it("checks a PIN without rehashing it when the credential's key is not held", async () => {
    const repository = new MemoryIdentityRepository();
    seedUser(repository, "plain", { credential: { userId: "plain", passwordHash: legacyTestHashSecret(PASSWORD), pinHash: legacyTestHashSecret(PIN), updatedAtMs: 1 } });
    const counting = countingKdf();
    const identity = createService(repository, counting.passwordKdf);
    const session = await identity.createSession("plain");

    await expect(identity.authorizeSessionPin({ sessionId: session.id, pin: PIN })).resolves.toMatchObject({ id: "plain" });

    expect(counting.parameters).toEqual([LEGACY_N]);
    expect(repository.records.get("credential:plain")?.data.credential).toMatchObject({ pinHash: expect.stringMatching(LEGACY_HASH) });
  });

  it("asks a session to sign in again for a PIN check when no credential is unlocked in this process", async () => {
    const repository = new MemoryIdentityRepository();
    const first = createService(repository);
    await first.upsertUser({ id: "user.one", username: "user-one", displayName: "User One", roleId: "admin", password: PASSWORD, pin: PIN });
    const login = await first.authenticate({ username: "user-one", password: PASSWORD });

    await expect(createService(repository).authorizeSessionPin({ sessionId: login.session.id, pin: PIN }))
      .rejects.toThrow("PIN verifier upgrade required. Sign out and sign back in, then try again.");
  });

  it("persists no PIN verifier and removes one an older build stored", async () => {
    const repository = new MemoryIdentityRepository();
    await createService(repository).upsertUser({ id: "user.one", username: "user-one", displayName: "User One", roleId: "admin", password: PASSWORD, pin: PIN });
    const metadata = () => repository.records.get("credential:user.one")?.data.metadata as Record<string, unknown>;
    expect(metadata()).toMatchObject({ pinConfigured: true });
    expect(metadata()).not.toHaveProperty("pinVerifierHash");

    metadata().pinVerifierHash = legacyTestHashSecret(PIN);
    await createService(repository).snapshot();

    expect(metadata()).not.toHaveProperty("pinVerifierHash");
    expect(metadata()).toMatchObject({ userId: "user.one", pinConfigured: true, passwordConfigured: true });
  });
});

describe("IdentityAccessService sessions", () => {
  it("stores sessions under the SHA-256 digest of their id, never the id", async () => {
    const repository = new MemoryIdentityRepository();
    const session = await createService(repository).createSession("admin");
    const digest = createHash("sha256").update(session.id, "utf8").digest("hex");

    expect(digestSessionId(session.id)).toBe(digest);
    expect(JSON.stringify([...repository.records.entries()])).not.toContain(session.id);
    expect(repository.records.get(`session:${digest}`)?.data).toMatchObject({ recordType: "session", sessionDigest: { digest, userId: "admin" } });

    const restarted = createService(repository);
    await expect(restarted.validateSession(session.id)).resolves.toMatchObject({ session: { id: session.id }, user: { id: "admin" } });
    await expect(restarted.validateSession(digest)).resolves.toBeNull();
    expect(JSON.stringify((await restarted.snapshot()).sessions)).not.toContain(session.id);
  });

  it("ignores and removes a session stored under its raw id, so its user signs in again", async () => {
    const repository = new MemoryIdentityRepository();
    await createService(repository).createSession("admin");
    const rawId = "00000000-0000-4000-8000-000000000000";
    repository.records.set(`session:${rawId}`, envelope(`session:${rawId}`, {
      stateKind: "session",
      recordType: "session",
      session: { id: rawId, userId: "admin", expiresAtMs: Date.now() + 60_000 }
    }));

    await expect(createService(repository).validateSession(rawId)).resolves.toBeNull();
    expect(repository.records.has(`session:${rawId}`)).toBe(false);
  });

  it("keeps a revoked session revoked after a reload", async () => {
    const repository = new MemoryIdentityRepository();
    const identity = createService(repository);
    const kept = await identity.createSession("admin");
    const revoked = await identity.createSession("admin");

    await expect(identity.revokeSession(revoked.id)).resolves.toBe(true);

    await expect(identity.validateSession(revoked.id)).resolves.toBeNull();
    await expect(createService(repository).validateSession(revoked.id)).resolves.toBeNull();
    await expect(identity.validateSession(kept.id)).resolves.not.toBeNull();
  });
});

describe("IdentityAccessService upsertUser", () => {
  it("refuses to change an existing account's password or PIN, leaving its profile and credentials as they were", async () => {
    const repository = new MemoryIdentityRepository();
    const events: string[] = [];
    const identity = createService(repository, countingKdf().passwordKdf, [{
      prepare: async () => {
        events.push("prepare");
      },
      commit: async () => {
        events.push("commit");
      },
      abort: async () => {
        events.push("abort");
      }
    }]);
    await identity.upsertUser({ id: "user.one", username: "user-one", displayName: "User One", roleId: "admin", password: PASSWORD, pin: PIN });
    const puts = repository.puts.length;

    await expect(identity.upsertUser({ id: "user.one", username: "user-one", displayName: "Renamed", roleId: "admin", password: NEW_PASSWORD }))
      .rejects.toThrow("password or PIN cannot be changed here");
    await expect(identity.upsertUser({ id: "user.one", username: "user-one", displayName: "Renamed", roleId: "admin", pin: WRONG_PIN }))
      .rejects.toThrow("password or PIN cannot be changed here");

    expect(repository.puts).toHaveLength(puts);
    expect(events).toEqual([]);
    expect(opensWith(repository, "user.one", PASSWORD)).toBe(true);
    const login = await identity.authenticate({ username: "user-one", password: PASSWORD });
    expect(login.user.displayName).toBe("User One");
    await expect(identity.authenticate({ username: "user-one", password: NEW_PASSWORD })).rejects.toThrow(INVALID);
    await expect(identity.authorizeSessionPin({ sessionId: login.session.id, pin: WRONG_PIN })).rejects.toThrow("Invalid PIN");
    await expect(identity.authorizeSessionPin({ sessionId: login.session.id, pin: PIN })).resolves.toMatchObject({ id: "user.one" });
    await expect(createService(repository).authenticate({ username: "user-one", password: PASSWORD })).resolves.toMatchObject({ user: { displayName: "User One" } });
  });

  it("still updates an existing account's profile when no password or PIN is given", async () => {
    const repository = new MemoryIdentityRepository();
    const identity = createService(repository);
    await identity.upsertUser({ id: "user.one", username: "user-one", displayName: "User One", roleId: "admin", password: PASSWORD });

    await expect(identity.upsertUser({ id: "user.one", username: "user-one", displayName: "Renamed", roleId: "admin", password: "", pin: "" }))
      .resolves.toMatchObject({ id: "user.one", displayName: "Renamed" });

    await expect(createService(repository).authenticate({ username: "user-one", password: PASSWORD })).resolves.toMatchObject({ user: { displayName: "Renamed" } });
  });
});

describe("IdentityAccessService credential-change port", () => {
  it("prepares subscribers before a self-service password write and commits them after it", async () => {
    const repository = new MemoryIdentityRepository();
    const events: string[] = [];
    const changes: IdentityCredentialChange[] = [];
    const subscriber: IdentityCredentialChangeSubscriber = {
      prepare: async (change) => {
        changes.push(change);
        events.push(`prepare:${opensWith(repository, change.userId, PASSWORD) ? "old" : "new"}`);
      },
      commit: async (change) => {
        events.push(`commit:${opensWith(repository, change.userId, NEW_PASSWORD) ? "new" : "old"}`);
      },
      abort: async () => {
        events.push("abort");
      }
    };
    const identity = createService(repository, countingKdf().passwordKdf, [subscriber]);
    await identity.upsertUser({ id: "user.one", username: "user-one", displayName: "User One", roleId: "admin", password: PASSWORD });
    const login = await identity.authenticate({ username: "user-one", password: PASSWORD });

    await identity.setPasswordAuthorized({ userId: "user.one", password: NEW_PASSWORD, sessionId: login.session.id, authorizationPassword: PASSWORD, authorizationPin: undefined, authorizationTotp: undefined });

    expect(events).toEqual(["prepare:old", "commit:new"]);
    expect(changes[0]).toMatchObject({ userId: "user.one", actorUserId: "user.one", currentPassword: PASSWORD, newPassword: NEW_PASSWORD, changeId: expect.any(String) });
  });

  it("refuses the password change when a subscriber fails to prepare", async () => {
    const repository = new MemoryIdentityRepository();
    const events: string[] = [];
    const recording = (name: string, failPrepare: boolean): IdentityCredentialChangeSubscriber => ({
      prepare: async () => {
        events.push(`${name}:prepare`);
        if (failPrepare) throw new Error("Keys could not be re-sealed");
      },
      commit: async () => {
        events.push(`${name}:commit`);
      },
      abort: async () => {
        events.push(`${name}:abort`);
      }
    });
    const identity = createService(repository, countingKdf().passwordKdf, [recording("ready", false), recording("failing", true)]);
    await identity.upsertUser({ id: "user.one", username: "user-one", displayName: "User One", roleId: "admin", password: PASSWORD });
    const login = await identity.authenticate({ username: "user-one", password: PASSWORD });

    await expect(identity.setPasswordAuthorized({ userId: "user.one", password: NEW_PASSWORD, sessionId: login.session.id, authorizationPassword: PASSWORD, authorizationPin: undefined, authorizationTotp: undefined }))
      .rejects.toThrow("Keys could not be re-sealed");

    expect(events).toEqual(["ready:prepare", "failing:prepare", "ready:abort", "failing:abort"]);
    await expect(identity.authenticate({ username: "user-one", password: NEW_PASSWORD })).rejects.toThrow(INVALID);
    await expect(createService(repository).authenticate({ username: "user-one", password: PASSWORD })).resolves.toMatchObject({ user: { id: "user.one" } });
  });

  it("aborts subscribers and keeps the old password when the credential write fails", async () => {
    const repository = new MemoryIdentityRepository();
    const events: string[] = [];
    const identity = createService(repository, countingKdf().passwordKdf, [{
      prepare: async () => {
        events.push("prepare");
      },
      commit: async () => {
        events.push("commit");
      },
      abort: async () => {
        events.push("abort");
      }
    }]);
    await identity.upsertUser({ id: "user.one", username: "user-one", displayName: "User One", roleId: "admin", password: PASSWORD });
    repository.failPutsFor = "credential:user.one";

    await expect(identity.setPassword("user.one", NEW_PASSWORD)).rejects.toThrow("store unavailable");

    repository.failPutsFor = undefined;
    expect(events).toEqual(["prepare", "abort"]);
    await expect(identity.authenticate({ username: "user-one", password: NEW_PASSWORD })).rejects.toThrow(INVALID);
    await expect(identity.authenticate({ username: "user-one", password: PASSWORD })).resolves.toMatchObject({ user: { id: "user.one" } });
    await expect(createService(repository).authenticate({ username: "user-one", password: PASSWORD })).resolves.toMatchObject({ user: { id: "user.one" } });
  });

  it("announces an administrator's reset of another account without a current password", async () => {
    const repository = new MemoryIdentityRepository();
    const seeding = createService(repository);
    await seeding.upsertUser({ id: "user.one", username: "user-one", displayName: "User One", roleId: "admin", password: PASSWORD });
    await seeding.upsertUser({ id: "user.two", username: "user-two", displayName: "User Two", roleId: "admin", password: PASSWORD });
    const changes: IdentityCredentialChange[] = [];
    const identity = createService(repository, countingKdf().passwordKdf, [{
      prepare: async (change) => {
        changes.push(change);
      },
      commit: async () => undefined,
      abort: async () => undefined
    }]);
    const login = await identity.authenticate({ username: "user-one", password: PASSWORD });

    await identity.setPasswordAuthorized({ userId: "user.two", password: NEW_PASSWORD, sessionId: login.session.id, authorizationPassword: PASSWORD, authorizationPin: undefined, authorizationTotp: undefined });

    expect(changes).toHaveLength(1);
    expect(changes[0]).toMatchObject({ userId: "user.two", actorUserId: "user.one", newPassword: NEW_PASSWORD });
    expect(changes[0]?.currentPassword).toBeUndefined();
    await expect(createService(repository).authenticate({ username: "user-two", password: NEW_PASSWORD })).resolves.toMatchObject({ user: { id: "user.two" } });
  });
});

function createService(
  repository: Repository | undefined,
  passwordKdf = countingKdf().passwordKdf,
  credentialChangeSubscribers: IdentityCredentialChangeSubscriber[] = []
): IdentityAccessService {
  return new IdentityAccessService({ repository, passwordKdf, credentialChangeSubscribers });
}

/** Wraps the real derivation at test parameters, recording each requested N before it runs and each key after. */
function countingKdf(): { parameters: number[]; keys: Buffer[]; passwordKdf: { derive: DeriveScryptKeyFn; testOnlyWeakParameters: ScryptParameters } } {
  const parameters: number[] = [];
  const keys: Buffer[] = [];
  const derive: DeriveScryptKeyFn = async (secret, salt, scryptParameters, options) => {
    parameters.push(scryptParameters.N);
    const key = await deriveScryptKey(secret, salt, scryptParameters, options);
    keys.push(key);
    return key;
  };
  return { parameters, keys, passwordKdf: { derive, testOnlyWeakParameters: WEAK } };
}

function copy<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function envelope(id: string, data: Record<string, unknown>): RecordEnvelope {
  return { id, kind: "identity.users", scope: {}, data: data as JsonObject, createdAtMs: 1, updatedAtMs: 1 };
}

function seedUser(repository: MemoryIdentityRepository, id: string, credentialData: Record<string, unknown>, enabled = true): void {
  repository.records.set(`user:${id}`, envelope(`user:${id}`, {
    stateKind: "user",
    recordType: "user",
    user: { id, username: id, displayName: id, roleId: "admin", enabled, totpEnabled: false, createdAtMs: 1, updatedAtMs: 1 }
  }));
  repository.records.set(`credential:${id}`, envelope(`credential:${id}`, { stateKind: "credential", recordType: "credential", ...credentialData }));
}

/** A user an older build sealed: a version 1 envelope holding legacy password and PIN hashes. */
function seedLegacyV1User(repository: MemoryIdentityRepository): StoredSeal {
  const credential: UserCredential = { userId: "legacy", passwordHash: legacyTestHashSecret(PASSWORD), pinHash: legacyTestHashSecret(PIN), updatedAtMs: 1 };
  const sealed = legacyTestSeal(credential, PASSWORD);
  seedUser(repository, "legacy", {
    encrypted: true,
    metadata: { userId: "legacy", passwordConfigured: true, pinConfigured: true, totpConfigured: false, pendingTotpConfigured: false, updatedAtMs: 1 },
    sealed
  });
  return sealed;
}

function legacyTestHashSecret(value: string): string {
  const salt = randomBytes(16).toString("base64url");
  return `scrypt:${salt}:${scryptSync(value, salt, 32).toString("base64url")}`;
}

function legacyTestSeal(credential: UserCredential, password: string): StoredSeal {
  const salt = randomBytes(16).toString("base64url");
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", scryptSync(password, salt, 32), iv);
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(credential), "utf8"), cipher.final()]);
  return { version: 1, algorithm: "aes-256-gcm", kdf: "scrypt", salt, iv: iv.toString("base64url"), tag: cipher.getAuthTag().toString("base64url"), ciphertext: ciphertext.toString("base64url") };
}

function openTestSeal(sealed: StoredSeal, password: string): UserCredential {
  const parameters = sealed.kdfParams;
  const key = sealed.version === 2 && parameters
    ? scryptSync(password, Buffer.from(sealed.salt, "base64url"), 32, { N: parameters.N, r: parameters.r, p: parameters.p, maxmem: 256 * parameters.N * parameters.r })
    : scryptSync(password, sealed.salt, 32);
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(sealed.iv, "base64url"));
  decipher.setAuthTag(Buffer.from(sealed.tag, "base64url"));
  const plaintext = Buffer.concat([decipher.update(Buffer.from(sealed.ciphertext, "base64url")), decipher.final()]);
  return JSON.parse(plaintext.toString("utf8")) as UserCredential;
}

function storedSeal(repository: MemoryIdentityRepository, userId: string): StoredSeal {
  return repository.records.get(`credential:${userId}`)?.data.sealed as unknown as StoredSeal;
}

function opensWith(repository: MemoryIdentityRepository, userId: string, password: string): boolean {
  try {
    openTestSeal(storedSeal(repository, userId), password);
    return true;
  } catch {
    return false;
  }
}

function isZero(buffer: Buffer | undefined): boolean {
  return buffer !== undefined && buffer.every((byte) => byte === 0);
}

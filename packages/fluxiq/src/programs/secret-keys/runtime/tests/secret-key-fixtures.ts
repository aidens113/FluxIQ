// Test support for the Secret Keys runtime tests: weak scrypt parameters, a
// derivation probe that counts derivations and can hold one, version 1 records
// sealed exactly as the version 1 service sealed them, an in-memory repository
// whose reads and writes can be held, and readers of the service's private
// state. Since t928 the service seals every new value for host protection, so
// keys sealed under a password the way the service did before are written by
// `createPasswordSealedKey` and `rotatePasswordSealedKey`: old-format data, for
// the paths that still read, unlock, upgrade and re-seal it. Dummy passwords
// and values only.

import { createCipheriv, randomBytes, randomUUID, scryptSync } from "node:crypto";
import { expect } from "vitest";
import type { JsonObject } from "../../../../core/index.ts";
import { AesGcmSecretKeyHostProtection } from "../../../../platform/custody/protection/index.ts";
import { deriveScryptKey, type DeriveScryptKeyFn, type ScryptParameters } from "../../../_shared/password-kdf/index.ts";
import { createRecord, type RecordEnvelope, type Repository } from "../../../database-manager/index.ts";
import type { EncryptedSecretValueRecordV1, SecretKeyKind, SecretKeyRecord, SecretKeySummary } from "../../types.ts";
import type { SecretKeyDataKeys } from "../access/index.ts";
import type { HeldKeys } from "../held-keys.ts";
import type { SecretKeyStore } from "../key-store.ts";
import type { ModelKeySettings } from "../model-key-settings.ts";
import type { SecretKeysService } from "../service.ts";
import type { SecretValueSealer } from "../value-sealer.ts";

export const WEAK_SCRYPT_PARAMETERS: ScryptParameters = Object.freeze({ N: 2 ** 10, r: 8, p: 1, keyLength: 32 });

/** Host protection over one fixed in-memory key, and the store identity it binds: what a service needs to save a key. */
export function hostProtectionOptions(storeId = "test-store"): { hostProtection: AesGcmSecretKeyHostProtection; protectionStoreId: string } {
  return { hostProtection: new AesGcmSecretKeyHostProtection(() => ({ keyId: "test.host.key", key: Buffer.alloc(32, 7) })), protectionStoreId: storeId };
}

type PasswordSealedKeyInput = {
  name: string;
  value: string;
  authorizationPassword: string;
  kind?: SecretKeyKind;
  provider?: string;
  description?: string;
  enabled?: boolean;
  metadata?: JsonObject;
  createdBy?: string | undefined;
  nowMs?: number;
};

type SealingInternals = { store: SecretKeyStore; sealer: SecretValueSealer; dataKeys: SecretKeyDataKeys; modelKeys: ModelKeySettings };

function sealing(service: SecretKeysService): SealingInternals {
  return service as unknown as SealingInternals;
}

/** Boxes a password-proved key to its prover's holders, as the service did before t928; the copy is zeroed. */
async function boxForProver(service: SecretKeysService, userId: string | undefined, record: SecretKeyRecord, key: Buffer): Promise<void> {
  if (!userId) return;
  const copy = Buffer.from(key);
  try {
    await service.credentialUnlocks.personProved(userId, new Map([[record.id, { keyUpdatedAtMs: record.updatedAtMs, decryptionKey: copy }]]));
  } finally {
    copy.fill(0);
  }
}

/**
 * Writes a key exactly as `createKey` did before t928: sealed under
 * `authorizationPassword` (version 2, stamped for `createdBy`), wrapped with
 * host protection when the service has it and the key an owner, and boxed to
 * the owner's holders.
 */
export async function createPasswordSealedKey(service: SecretKeysService, input: PasswordSealedKeyInput): Promise<SecretKeySummary> {
  const { store, sealer, dataKeys, modelKeys } = sealing(service);
  await store.load();
  const now = input.nowMs ?? Date.now();
  const id = `secret:${randomUUID()}`;
  const createdBy = input.createdBy?.trim() || undefined;
  const fields: Omit<SecretKeyRecord, "sealed"> = {
    id,
    name: input.name,
    kind: input.kind ?? "llm",
    ...(input.provider ? { provider: input.provider } : {}),
    scope: "global",
    ...(input.description ? { description: input.description } : {}),
    enabled: input.enabled ?? true,
    ...(createdBy ? { createdBy } : {}),
    createdAtMs: now,
    updatedAtMs: now,
    lastRotatedAtMs: now,
    ...(input.metadata ? { metadata: input.metadata } : {}),
    recordType: "secret-key",
    encrypted: true
  };
  const { sealed, key } = await sealer.seal({ id, value: input.value, updatedAtMs: now }, input.authorizationPassword, createdBy);
  try {
    const record = await dataKeys.protect({ ...fields, sealed }, key, createdBy);
    if (!await store.commit(record, undefined)) throw new Error("Secret key changed during creation.");
    await boxForProver(service, createdBy, record, key);
  } finally {
    key.fill(0);
  }
  await modelKeys.load();
  await modelKeys.ensureDefault();
  return (await service.getKeySummary(id))!;
}

/**
 * Replaces a key's value exactly as `rotateKey` did before t928: sealed under
 * `authorizationPassword` (stamped for `actorUserId`), protected for the key's
 * owner, every old holder revoked, and boxed to the rotator when they own it.
 */
export async function rotatePasswordSealedKey(service: SecretKeysService, input: { id: string; value: string; authorizationPassword: string; actorUserId?: string; nowMs?: number }): Promise<SecretKeySummary> {
  const { store, sealer, dataKeys } = sealing(service);
  await store.load();
  const existing = store.require(input.id);
  const now = Math.max(input.nowMs ?? Date.now(), existing.updatedAtMs + 1);
  const { sealed, key } = await sealer.seal({ id: existing.id, value: input.value, updatedAtMs: now }, input.authorizationPassword, input.actorUserId);
  try {
    let current = existing;
    let next: SecretKeyRecord = { ...current, updatedAtMs: Math.max(now, current.updatedAtMs + 1), lastRotatedAtMs: now, sealed, pendingSealed: undefined, hostProtection: undefined, pendingHostProtection: undefined };
    // A write that lands first (a seal upgrade) is written over, as the old rotation did; another rotation is not.
    for (;;) {
      next = await dataKeys.protect(next, key, current.createdBy ?? input.actorUserId);
      if (await store.commit(next, current)) break;
      const latest = store.get(existing.id);
      if (!latest || latest.lastRotatedAtMs !== current.lastRotatedAtMs) throw new Error("Secret key changed during rotation.");
      current = latest;
      next = { ...latest, updatedAtMs: Math.max(now, latest.updatedAtMs + 1), lastRotatedAtMs: now, sealed, hostProtection: next.hostProtection, pendingSealed: undefined, pendingHostProtection: undefined };
    }
    internals(service).heldKeys.revokeKey(current.id);
    await service.credentialUnlocks.dropKey(current.id);
    if (input.actorUserId && (current.createdBy === undefined || current.createdBy === input.actorUserId)) await boxForProver(service, input.actorUserId, next, key);
    return (await service.getKeySummary(current.id))!;
  } finally {
    key.fill(0);
  }
}

export type Hold = {
  /** Resolves once the held operation is waiting. */
  readonly started: Promise<void>;
  release(): void;
};

type PendingHold = Hold & { begin(): void; readonly gate: Promise<void> };

function createHold(): PendingHold {
  let begin = () => {};
  let release = () => {};
  const started = new Promise<void>((resolve) => { begin = resolve; });
  const gate = new Promise<void>((resolve) => { release = resolve; });
  return { started, gate, begin: () => begin(), release: () => release() };
}

async function waitOn(hold: PendingHold | undefined): Promise<void> {
  if (!hold) return;
  hold.begin();
  await hold.gate;
}

export type DeriveProbe = {
  readonly derive: DeriveScryptKeyFn;
  /** Derivations requested so far, or only those at scrypt `N`. */
  count(N?: number): number;
  /** Holds the next derivation requested at scrypt `N` until released. */
  holdNext(N: number): Hold;
};

/** A real `deriveScryptKey` behind a counter, for asserting how many derivations ran and for holding one mid-flight. */
export function createDeriveProbe(): DeriveProbe {
  const requested: number[] = [];
  const holds: Array<{ N: number; hold: PendingHold }> = [];
  return {
    derive: async (secret, salt, parameters, options) => {
      requested.push(parameters.N);
      const index = holds.findIndex((entry) => entry.N === parameters.N);
      if (index >= 0) await waitOn(holds.splice(index, 1)[0]?.hold);
      return deriveScryptKey(secret, salt, parameters, options);
    },
    count: (N) => (N === undefined ? requested.length : requested.filter((value) => value === N).length),
    holdNext: (N) => {
      const hold = createHold();
      holds.push({ N, hold });
      return hold;
    }
  };
}

/** Seals a value exactly as the version 1 service did: `scryptSync` at Node's default cost over the salt text, then AES-256-GCM. */
export function legacySealV1(payload: { id: string; value: string; updatedAtMs: number }, password: string): EncryptedSecretValueRecordV1 {
  const salt = randomBytes(16).toString("base64url");
  const key = scryptSync(password, salt, 32);
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(payload), "utf8"), cipher.final()]);
  key.fill(0);
  return {
    version: 1,
    algorithm: "aes-256-gcm",
    kdf: "scrypt",
    salt,
    iv: iv.toString("base64url"),
    tag: cipher.getAuthTag().toString("base64url"),
    ciphertext: ciphertext.toString("base64url")
  };
}

/** A version 1 key record as the version 1 service stored it, created and last rotated at `atMs`. */
export function legacyV1Record(input: { id: string; value: string; password: string; atMs?: number; createdBy?: string }): SecretKeyRecord {
  const atMs = input.atMs ?? 1000;
  return {
    id: input.id,
    name: `Key ${input.id}`,
    kind: "custom",
    scope: "global",
    enabled: true,
    ...(input.createdBy ? { createdBy: input.createdBy } : {}),
    createdAtMs: atMs,
    updatedAtMs: atMs,
    lastRotatedAtMs: atMs,
    recordType: "secret-key",
    encrypted: true,
    sealed: legacySealV1({ id: input.id, value: input.value, updatedAtMs: atMs }, input.password)
  };
}

export type MemoryRepository = {
  readonly repository: Repository;
  /** A stored row's JSON text, exactly as written. */
  storedText(id: string): string | undefined;
  stored(id: string): SecretKeyRecord | undefined;
  /** Overwrites a stored row with arbitrary data, for tampering. */
  replace(id: string, data: unknown): void;
  putCount(): number;
  listCount(): number;
  /** Holds the next `put` after it has captured its data, before it lands. */
  holdNextPut(): Hold;
  holdNextList(): Hold;
};

/** An in-memory repository. A `put` captures its data when called and lands when it completes, like a real store. */
export function createMemoryRepository(records: readonly SecretKeyRecord[] = []): MemoryRepository {
  const rows = new Map<string, string>(records.map((record) => [record.id, JSON.stringify(record)]));
  let puts = 0;
  let lists = 0;
  let putHold: PendingHold | undefined;
  let listHold: PendingHold | undefined;
  const envelope = (id: string, text: string): RecordEnvelope => createRecord({ id, kind: "secret.keys", data: JSON.parse(text) as JsonObject });
  const repository: Repository = {
    list: async () => {
      lists += 1;
      const hold = listHold;
      listHold = undefined;
      await waitOn(hold);
      return [...rows].map(([id, text]) => envelope(id, text));
    },
    get: async (id) => {
      const text = rows.get(id);
      return text === undefined ? null : envelope(id, text);
    },
    put: async (record) => {
      puts += 1;
      const text = JSON.stringify(record.data);
      const hold = putHold;
      putHold = undefined;
      await waitOn(hold);
      rows.set(record.id, text);
      return record;
    },
    delete: async (id) => rows.delete(id)
  };
  return {
    repository,
    storedText: (id) => rows.get(id),
    stored: (id) => {
      const text = rows.get(id);
      return text === undefined ? undefined : (JSON.parse(text) as SecretKeyRecord);
    },
    replace: (id, data) => {
      rows.set(id, JSON.stringify(data));
    },
    putCount: () => puts,
    listCount: () => lists,
    holdNextPut: () => {
      putHold = createHold();
      return putHold;
    },
    holdNextList: () => {
      listHold = createHold();
      return listHold;
    }
  };
}

type ServiceInternals = {
  store: SecretKeyStore;
  heldKeys: HeldKeys;
};

function internals(service: SecretKeysService): ServiceInternals {
  return service as unknown as ServiceInternals;
}

/** The service's in-memory record for a key. */
export function serviceRecord(service: SecretKeysService, id: string): SecretKeyRecord | undefined {
  return internals(service).store.get(id);
}

/** The key buffer a session unlock holds for a record. */
export function heldSessionKey(service: SecretKeysService, sessionId: string, keyId: string): Buffer | undefined {
  return internals(service).heldKeys.session(sessionId)?.decryptionKeys.get(keyId)?.decryptionKey;
}

/** Claims a key's value through a session unlock, as an LLM execution grant does. */
export async function claimThroughSession(service: SecretKeysService, sessionId: string, userId: string, keyId: string): Promise<string> {
  const authorization = await service.createSessionRevealAuthorization({ sessionId, userId, id: keyId });
  return (await service.revealKeyWithAuthorization({ authorizationId: authorization.authorizationId, id: keyId })).value;
}

/** Polls on real timers until `condition` holds, failing after about two seconds. */
export async function waitUntil(condition: () => boolean): Promise<void> {
  for (let attempt = 0; attempt < 400 && !condition(); attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  expect(condition()).toBe(true);
}

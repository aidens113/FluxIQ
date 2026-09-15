import { randomUUID } from "node:crypto";
import type { JsonObject } from "../../../core/index.ts";
import type { PasswordKdfOptions } from "../../_shared/password-kdf/index.ts";
import type { Repository } from "../../database-manager/index.ts";
import type {
  SecretKeyKind,
  SecretKeyRecord,
  SecretKeyScope,
  SecretKeySummary,
  SecretKeysSnapshot
} from "../types.ts";
import { CredentialChanges, type OpenedRecordSeal, type SecretKeyCredentialChange, type SecretKeyCredentialChangeInput } from "./credential-changes.ts";
import { HeldKeys, type HeldRevealAuthorization, type HeldSessionUnlock, type SecretRevealAuthorizationMetadata } from "./held-keys.ts";
import { SecretKeyStore } from "./key-store.ts";
import { SealUpgrades } from "./seal-upgrades.ts";
import { SecretValueSealer } from "./value-sealer.ts";

export type { SecretKeyCredentialChange, SecretKeyCredentialChangeInput } from "./credential-changes.ts";
export type { SecretRevealAuthorizationMetadata } from "./held-keys.ts";

type CreateSecretKeyInput = {
  name: string;
  value: string;
  authorizationPassword?: string;
  kind?: SecretKeyKind;
  provider?: string;
  scope?: SecretKeyScope;
  scopeRef?: string;
  description?: string;
  enabled?: boolean;
  metadata?: JsonObject;
  /** The creating user; also stamped on the seal as `sealedByUserId`. */
  createdBy?: string | undefined;
  nowMs?: number;
};

type UpdateSecretKeyInput = {
  id: string;
  name?: string;
  kind?: SecretKeyKind;
  provider?: string;
  scope?: SecretKeyScope;
  scopeRef?: string;
  description?: string;
  enabled?: boolean;
  metadata?: JsonObject;
  nowMs?: number;
};

type RotateSecretKeyInput = {
  id: string;
  value: string;
  authorizationPassword?: string;
  /** The user whose password seals the new value, stamped as `sealedByUserId`. */
  actorUserId?: string | undefined;
  nowMs?: number;
};

type RevealSecretKeyInput = {
  id: string;
  authorizationPassword?: string;
  /** The user whose password opens the key, stamped if the reveal upgrades its seal. */
  actorUserId?: string | undefined;
  nowMs?: number;
};

const MAX_SECRET_REVEAL_AUTHORIZATION_TTL_MS = 300_000;

/**
 * Secret Keys: values sealed under account passwords. This class is the public
 * surface; records and their writes live in `SecretKeyStore`, held derived keys
 * in `HeldKeys`, seal upgrades in `SealUpgrades`, and credential changes,
 * including pending seals, in `CredentialChanges`.
 */
export class SecretKeysService {
  static readonly storeKind = "secret.keys";

  private readonly heldKeys = new HeldKeys();
  private readonly sealer: SecretValueSealer;
  private readonly store: SecretKeyStore;
  private readonly upgrades: SealUpgrades;
  private readonly credentialChanges: CredentialChanges;
  private readonly now: () => number;

  constructor(options: { repository?: Repository; now?: () => number; passwordKdf?: PasswordKdfOptions } = {}) {
    this.now = options.now ?? Date.now;
    this.sealer = new SecretValueSealer(options.passwordKdf);
    this.store = new SecretKeyStore({ repository: options.repository, kind: SecretKeysService.storeKind, sealer: this.sealer });
    this.upgrades = new SealUpgrades({ store: this.store, sealer: this.sealer, heldKeys: this.heldKeys });
    this.credentialChanges = new CredentialChanges({ store: this.store, sealer: this.sealer, heldKeys: this.heldKeys, upgrades: this.upgrades });
  }

  async snapshot(): Promise<SecretKeysSnapshot> {
    await this.store.load();
    return {
      keys: this.store.list()
        .map(toSummary)
        .sort((left, right) => right.updatedAtMs - left.updatedAtMs || left.name.localeCompare(right.name))
    };
  }

  async getKeySummary(id: string): Promise<SecretKeySummary | null> {
    await this.store.load();
    const record = this.store.get(id);
    return record ? toSummary(record) : null;
  }

  async createKey(input: CreateSecretKeyInput): Promise<SecretKeySummary> {
    await this.store.load();
    const now = input.nowMs ?? Date.now();
    const id = `secret:${randomUUID()}`;
    const name = cleanRequired(input.name, "name");
    const createdBy = cleanOptional(input.createdBy);
    const { sealed, key } = await this.sealer.seal({ id, value: input.value, updatedAtMs: now }, requirePassword(input.authorizationPassword), createdBy);
    key.fill(0);
    const record: SecretKeyRecord = {
      id,
      name,
      kind: normalizeKind(input.kind),
      ...(cleanOptional(input.provider) ? { provider: cleanOptional(input.provider) } : {}),
      scope: normalizeScope(input.scope),
      ...(cleanOptional(input.scopeRef) ? { scopeRef: cleanOptional(input.scopeRef) } : {}),
      ...(cleanOptional(input.description) ? { description: cleanOptional(input.description) } : {}),
      enabled: input.enabled ?? true,
      ...(createdBy ? { createdBy } : {}),
      createdAtMs: now,
      updatedAtMs: now,
      lastRotatedAtMs: now,
      ...(input.metadata ? { metadata: input.metadata } : {}),
      recordType: "secret-key",
      encrypted: true,
      sealed
    };
    this.store.set(record);
    await this.store.persist(id);
    return toSummary(record);
  }

  async updateKey(input: UpdateSecretKeyInput): Promise<SecretKeySummary> {
    await this.store.load();
    const existing = this.store.require(input.id);
    const updatedAtMs = Math.max(input.nowMs ?? Date.now(), existing.updatedAtMs + 1);
    const next: SecretKeyRecord = {
      ...existing,
      ...(input.name !== undefined ? { name: cleanRequired(input.name, "name") } : {}),
      ...(input.kind !== undefined ? { kind: normalizeKind(input.kind) } : {}),
      ...(input.provider !== undefined ? optionalField("provider", input.provider) : {}),
      ...(input.scope !== undefined ? { scope: normalizeScope(input.scope) } : {}),
      ...(input.scopeRef !== undefined ? optionalField("scopeRef", input.scopeRef) : {}),
      ...(input.description !== undefined ? optionalField("description", input.description) : {}),
      ...(input.enabled !== undefined ? { enabled: input.enabled } : {}),
      ...(input.metadata !== undefined ? { metadata: input.metadata } : {}),
      updatedAtMs
    };
    this.store.set(next);
    this.heldKeys.revokeKey(existing.id);
    await this.store.persist(existing.id);
    return toSummary(next);
  }

  /** Seals a new value. A pending seal from a credential change holds the old value, so the rotation drops it. */
  async rotateKey(input: RotateSecretKeyInput): Promise<SecretKeySummary> {
    await this.store.load();
    const existing = this.store.require(input.id);
    const password = requirePassword(input.authorizationPassword);
    const now = Math.max(input.nowMs ?? Date.now(), existing.updatedAtMs + 1);
    const { sealed, key } = await this.sealer.seal({ id: existing.id, value: input.value, updatedAtMs: now }, password, cleanOptional(input.actorUserId));
    key.fill(0);
    const current = this.store.require(existing.id);
    const next: SecretKeyRecord = {
      ...current,
      updatedAtMs: Math.max(now, current.updatedAtMs + 1),
      lastRotatedAtMs: now,
      sealed,
      pendingSealed: undefined
    };
    this.store.set(next);
    this.heldKeys.revokeKey(current.id);
    await this.store.persist(current.id);
    return toSummary(next);
  }

  async revealKey(input: RevealSecretKeyInput): Promise<{ key: SecretKeySummary; value: string }> {
    await this.store.load();
    const record = this.store.require(input.id);
    const password = requirePassword(input.authorizationPassword);
    const opened = await this.credentialChanges.openCurrentOrPending(record, password);
    if (!opened) throw new Error("Secret key could not be opened");
    opened.key.fill(0);
    const { secret } = opened;
    const unchanged = this.store.get(record.id);
    // A failed write leaves the settled record in memory; after a restart the stored pending seal is settled again.
    if (sameSeals(unchanged, record)) await this.credentialChanges.settle(unchanged, opened.sealed).catch(() => undefined);
    await this.upgrades.upgrade(record.id, opened.sealed, secret, password, cleanOptional(input.actorUserId));
    const current = this.store.get(record.id);
    if (!current || current.lastRotatedAtMs !== record.lastRotatedAtMs) {
      secret.value = "";
      throw new Error("Secret key changed during reveal");
    }
    const next: SecretKeyRecord = { ...current, lastRevealedAtMs: input.nowMs ?? Date.now() };
    this.store.set(next);
    await this.store.persist(current.id);
    return { key: toSummary(next), value: secret.value };
  }

  async deleteKey(id: string): Promise<boolean> {
    await this.store.load();
    this.heldKeys.revokeKey(id);
    return this.store.delete(id);
  }

  async resolveSecretValue(input: RevealSecretKeyInput): Promise<string> {
    return (await this.revealKey(input)).value;
  }

  async createRevealAuthorization(input: { id: string; authorizationPassword?: string; ttlMs?: number; nowMs?: number }): Promise<SecretRevealAuthorizationMetadata> {
    await this.store.load();
    const record = this.store.require(input.id);
    const ttlMs = input.ttlMs ?? 60_000;
    if (!Number.isInteger(ttlMs) || ttlMs < 1000 || ttlMs > MAX_SECRET_REVEAL_AUTHORIZATION_TTL_MS) throw new Error("Secret reveal authorization TTL is invalid");
    const opened = await this.credentialChanges.openCurrentOrPending(record, requirePassword(input.authorizationPassword));
    if (!opened) throw new Error("Secret reveal authorization was refused");
    opened.secret.value = "";
    const current = this.store.get(record.id);
    if (!sameSeals(current, record)) {
      opened.key.fill(0);
      throw new Error("Secret key changed during authorization");
    }
    // Settling may promote the pending seal, which revokes the old key's holders, so the key is held after it.
    const settling = this.credentialChanges.settle(current, opened.sealed);
    const authorizationId = `secret-reveal:${randomUUID()}`;
    const expiryTimer = setTimeout(() => this.heldKeys.revokeAuthorization(authorizationId), ttlMs);
    expiryTimer.unref?.();
    const authorization: HeldRevealAuthorization = {
      authorizationId,
      keyId: current.id,
      keyUpdatedAtMs: current.updatedAtMs,
      expiresAtMs: (input.nowMs ?? this.now()) + ttlMs,
      remainingUses: 1,
      decryptionKey: opened.key,
      state: "available",
      expiryTimer
    };
    this.heldKeys.holdAuthorization(authorization);
    await settling.catch(() => undefined);
    return publicRevealAuthorization(authorization);
  }

  async unlockSession(input: { sessionId: string; userId: string; authorizationPassword: string; expiresAtMs: number; nowMs?: number }): Promise<{ sessionId: string; expiresAtMs: number; unlockedKeyCount: number }> {
    await this.store.load();
    const nowMs = input.nowMs ?? this.now();
    if (!input.sessionId || !input.userId || !input.authorizationPassword || !Number.isFinite(input.expiresAtMs) || input.expiresAtMs <= nowMs) {
      throw new Error("Secret key session unlock is invalid");
    }
    this.heldKeys.revokeSession(input.sessionId);
    const expiryTimer = setTimeout(() => this.heldKeys.revokeSession(input.sessionId), input.expiresAtMs - nowMs);
    expiryTimer.unref?.();
    // Held before any derivation: each key joins the session as soon as it is
    // verified, so a concurrent upgrade replaces it along with every other holder.
    const unlock: HeldSessionUnlock = {
      sessionId: input.sessionId,
      userId: input.userId,
      expiresAtMs: input.expiresAtMs,
      decryptionKeys: new Map(),
      expiryTimer
    };
    this.heldKeys.holdSession(unlock);
    await Promise.all(this.store.sealedFor(input.userId).map((record) => this.unlockRecord(unlock, record.id, input.authorizationPassword)));
    if (this.heldKeys.session(input.sessionId) !== unlock) throw new Error("Secret key session unlock is unavailable");
    return { sessionId: input.sessionId, expiresAtMs: input.expiresAtMs, unlockedKeyCount: unlock.decryptionKeys.size };
  }

  async createSessionRevealAuthorization(input: { sessionId: string; userId: string; id: string; ttlMs?: number; nowMs?: number }): Promise<SecretRevealAuthorizationMetadata> {
    await this.store.load();
    const nowMs = input.nowMs ?? this.now();
    const unlock = this.heldKeys.session(input.sessionId);
    if (!unlock || unlock.userId !== input.userId || unlock.expiresAtMs <= nowMs) {
      this.heldKeys.revokeSession(input.sessionId);
      throw new Error("Secret key session unlock is unavailable");
    }
    const existing = this.store.require(input.id);
    const unlockedKey = unlock.decryptionKeys.get(existing.id);
    if (!unlockedKey || unlockedKey.keyUpdatedAtMs !== existing.updatedAtMs) throw new Error("Secret key session unlock is unavailable");
    const requestedTtlMs = input.ttlMs ?? 60_000;
    const ttlMs = Math.min(requestedTtlMs, unlock.expiresAtMs - nowMs);
    if (!Number.isInteger(requestedTtlMs) || requestedTtlMs < 1000 || requestedTtlMs > MAX_SECRET_REVEAL_AUTHORIZATION_TTL_MS || ttlMs < 1) {
      throw new Error("Secret reveal authorization TTL is invalid");
    }
    const authorizationId = `secret-reveal:${randomUUID()}`;
    const expiryTimer = setTimeout(() => this.heldKeys.revokeAuthorization(authorizationId), ttlMs);
    expiryTimer.unref?.();
    const authorization: HeldRevealAuthorization = {
      authorizationId,
      keyId: existing.id,
      keyUpdatedAtMs: existing.updatedAtMs,
      expiresAtMs: nowMs + ttlMs,
      remainingUses: 1,
      decryptionKey: Buffer.from(unlockedKey.decryptionKey),
      sessionId: input.sessionId,
      state: "available",
      expiryTimer
    };
    this.heldKeys.holdAuthorization(authorization);
    return publicRevealAuthorization(authorization);
  }

  async revealKeyWithAuthorization(input: { authorizationId: string; id: string; nowMs?: number }): Promise<{ key: SecretKeySummary; value: string }> {
    const authorization = this.heldKeys.authorization(input.authorizationId);
    const nowMs = input.nowMs ?? this.now();
    if (!authorization || authorization.state !== "available" || authorization.keyId !== input.id) throw new Error("Secret reveal authorization is unavailable");
    if (authorization.expiresAtMs <= nowMs) {
      this.heldKeys.revokeAuthorization(input.authorizationId);
      throw new Error("Secret reveal authorization is unavailable");
    }
    authorization.state = "claimed";
    try {
      await this.store.load();
      const existing = this.store.require(input.id);
      if (existing.updatedAtMs !== authorization.keyUpdatedAtMs) throw new Error("Secret reveal authorization is no longer valid");
      const secret = this.sealer.openRecordWithKey(existing, authorization.decryptionKey);
      if (!secret) throw new Error("Invalid secret key payload");
      const next: SecretKeyRecord = { ...existing, lastRevealedAtMs: nowMs };
      this.store.set(next);
      await this.store.persist(existing.id);
      const active = this.heldKeys.authorization(input.authorizationId);
      if (active !== authorization || authorization.state !== "claimed" || authorization.expiresAtMs <= this.now()) {
        secret.value = "";
        throw new Error("Secret reveal authorization is unavailable");
      }
      const value = secret.value;
      this.heldKeys.revokeAuthorization(input.authorizationId);
      return { key: toSummary(next), value };
    } catch (error) {
      this.heldKeys.revokeAuthorization(input.authorizationId);
      throw error;
    }
  }

  /**
   * Re-seals the user's own keys under their next password and writes each
   * beside its current seal, for an Identity Access credential change: call
   * before the credential write, then `commitCredentialChange` after it or
   * `abortCredentialChange` if it fails. A rejection means the change must be
   * refused.
   */
  prepareCredentialChange(input: SecretKeyCredentialChangeInput): Promise<SecretKeyCredentialChange> {
    return this.credentialChanges.prepare(input);
  }

  commitCredentialChange(changeId: string): Promise<SecretKeyCredentialChange> {
    return this.credentialChanges.commit(changeId);
  }

  abortCredentialChange(changeId: string): void {
    this.credentialChanges.abort(changeId);
  }

  revokeRevealAuthorization(authorizationId: string): void {
    this.heldKeys.revokeAuthorization(authorizationId);
  }

  activeRevealAuthorizationCount(): number {
    return this.heldKeys.authorizationCount();
  }

  activeSessionUnlockCount(): number {
    return this.heldKeys.sessionCount();
  }

  revokeSessionUnlock(sessionId: string): void {
    this.heldKeys.revokeSession(sessionId);
  }

  /** Revokes every held key and forgets in-flight credential changes; their stored pending seals are settled at the next unlock or reveal. */
  close(): void {
    this.heldKeys.revokeAll();
    this.credentialChanges.forgetAll();
  }

  /**
   * Unlocks one record into a session: its current seal, or else its pending
   * seal, which is then promoted; then upgrades an older seal. A record whose
   * seals were replaced while its key was derived is retried once.
   */
  private async unlockRecord(unlock: HeldSessionUnlock, recordId: string, password: string): Promise<void> {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const record = this.store.get(recordId);
      if (!record) return;
      let opened: OpenedRecordSeal | null;
      try {
        opened = await this.credentialChanges.openCurrentOrPending(record, password);
      } catch {
        return;
      }
      if (!opened) return;
      const current = this.store.get(recordId);
      const active = this.heldKeys.session(unlock.sessionId) === unlock;
      if (!active || !sameSeals(current, record)) {
        opened.key.fill(0);
        opened.secret.value = "";
        if (!active) return;
        continue;
      }
      // Settling may promote the pending seal, which revokes the old key's holders, so the key is held after it.
      const settling = this.credentialChanges.settle(current, opened.sealed);
      unlock.decryptionKeys.set(recordId, { keyUpdatedAtMs: current.updatedAtMs, decryptionKey: opened.key });
      // A failed write leaves the settled record in memory; after a restart the stored pending seal is settled again.
      await settling.catch(() => undefined);
      await this.upgrades.upgrade(recordId, opened.sealed, opened.secret, password, unlock.userId);
      opened.secret.value = "";
      return;
    }
  }
}

/** True when the store still holds `record`'s current and pending seals. */
function sameSeals(current: SecretKeyRecord | undefined, record: SecretKeyRecord): current is SecretKeyRecord {
  return current !== undefined && current.sealed === record.sealed && current.pendingSealed === record.pendingSealed;
}

function toSummary(record: SecretKeyRecord): SecretKeySummary {
  return {
    id: record.id,
    name: record.name,
    kind: record.kind,
    ...(record.provider ? { provider: record.provider } : {}),
    scope: record.scope,
    ...(record.scopeRef ? { scopeRef: record.scopeRef } : {}),
    ...(record.description ? { description: record.description } : {}),
    enabled: record.enabled,
    ...(record.createdBy ? { createdBy: record.createdBy } : {}),
    createdAtMs: record.createdAtMs,
    updatedAtMs: record.updatedAtMs,
    lastRotatedAtMs: record.lastRotatedAtMs,
    ...(record.lastRevealedAtMs ? { lastRevealedAtMs: record.lastRevealedAtMs } : {}),
    ...(record.metadata ? { metadata: record.metadata } : {})
  };
}

function requirePassword(value: string | undefined): string {
  if (!value) throw new Error("authorizationPassword is required");
  return value;
}

function cleanRequired(value: string, label: string): string {
  const clean = value.trim();
  if (!clean) throw new Error(`${label} is required`);
  return clean;
}

function cleanOptional(value: string | undefined): string | undefined {
  const clean = value?.trim();
  return clean || undefined;
}

function optionalField(key: "provider" | "scopeRef" | "description", value: string | undefined): Partial<SecretKeyRecord> {
  const clean = cleanOptional(value);
  return clean ? { [key]: clean } : { [key]: undefined };
}

function normalizeKind(value: SecretKeyKind | undefined): SecretKeyKind {
  return value === "custom" ? "custom" : "llm";
}

function normalizeScope(value: SecretKeyScope | undefined): SecretKeyScope {
  return value === "domain" || value === "flow" || value === "custom" ? value : "global";
}

function publicRevealAuthorization(authorization: HeldRevealAuthorization): SecretRevealAuthorizationMetadata {
  return {
    authorizationId: authorization.authorizationId,
    keyId: authorization.keyId,
    keyUpdatedAtMs: authorization.keyUpdatedAtMs,
    expiresAtMs: authorization.expiresAtMs,
    remainingUses: 1
  };
}

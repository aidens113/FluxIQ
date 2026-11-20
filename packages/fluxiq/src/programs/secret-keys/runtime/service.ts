import { randomUUID } from "node:crypto";
import type { JsonObject } from "../../../core/index.ts";
import type { PasswordKdfOptions } from "../../_shared/password-kdf/index.ts";
import type { Repository } from "../../database-manager/index.ts";
import type {
  SecretKeyKind,
  SecretKeyRecord,
  SecretKeyScope,
  SecretKeySummary,
  SecretKeysSnapshot,
  SecretKeyUnlockRevoker
} from "../types.ts";
import { CredentialChanges, type OpenedRecordSeal, type SecretKeyCredentialChange, type SecretKeyCredentialChangeInput } from "./credential-changes.ts";
import { CredentialUnlocks, type SecretKeyHolderVouch } from "./unlocks/index.ts";
import { HeldKeys, type HeldRevealAuthorization, type HeldSessionUnlock, type SecretRevealAuthorizationMetadata } from "./held-keys.ts";
import { SecretKeyStore } from "./key-store.ts";
import { ModelKeySettings } from "./model-key-settings.ts";
import { SealUpgrades } from "./seal-upgrades.ts";
import { upgradeOpenedRecord } from "./sign-in-upgrade.ts";
import { ModelKeysChangeNotice } from "./model-keys-notice.ts";
import { SecretValueSealer } from "./value-sealer.ts";
import type { SecretKeyHostProtection } from "../../../platform/custody/protection/index.ts";
import { SecretKeyAccess, SecretKeyAccessUnavailableError, SecretKeyDataKeys, sameSecretKeyVersion, type SecretKeyUseAuthority, type SecretKeyManagementProof } from "./access/index.ts";

export type { SecretKeyCredentialChange, SecretKeyCredentialChangeInput } from "./credential-changes.ts";
export type { SecretRevealAuthorizationMetadata } from "./held-keys.ts";

/**
 * The signed-in session of the person changing a key, as the caller verified
 * it: its id, its user and when it expires. Only that user's own session takes
 * the key, and never past `expiresAtMs`.
 */
export type SecretKeyActorSession = {
  sessionId: string;
  userId: string;
  expiresAtMs: number;
};

type CreateSecretKeyInput = {
  name: string;
  value: string;
  kind?: SecretKeyKind;
  provider?: string;
  scope?: SecretKeyScope;
  scopeRef?: string;
  description?: string;
  enabled?: boolean;
  metadata?: JsonObject;
  /** The creating user, who owns the key: its value is protected for them. Required; a key nobody owns is refused. */
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
  /** The editor's own signed-in session: a key it already holds stays held across the edit. */
  actorSession?: SecretKeyActorSession | undefined;
  nowMs?: number;
};

type RotateSecretKeyInput = {
  id: string;
  value: string;
  /** The user replacing the value. The value stays protected for the key's owner; a key that had no owner becomes this user's. */
  actorUserId?: string | undefined;
  nowMs?: number;
};

type RevealSecretKeyInput = {
  id: string;
  authorizationPassword?: string;
  /** The user whose password opens the key, stamped if the reveal upgrades its seal. */
  actorUserId?: string | undefined;
  managementProof?: SecretKeyManagementProof;
  nowMs?: number;
};

/**
 * How `SecretKeysService.close` ends. `shutdown` revokes and zeroes every held
 * key. `evict` drops the instance but leaves a `HeldKeys` the service was given
 * as it is, so the next service over the same repository releases the same
 * unlocks; a service's own `HeldKeys` is revoked either way.
 */
export type SecretKeysCloseMode = "shutdown" | "evict";

const MAX_SECRET_REVEAL_AUTHORIZATION_TTL_MS = 300_000;

/** Said when a value cannot be protected for its owner, so it is not saved: a key saved without host protection could never be opened. */
const SECRET_KEY_UNPROTECTED_REFUSAL = "The key was not saved because this server's key protection is not available, and a key saved without it could never be opened. Restart FluxIQ on this machine, then save the key again.";
/** Said when nobody would own a new key. */
const SECRET_KEY_OWNERLESS_REFUSAL = "Sign in to save a key: a saved key belongs to the person who saves it.";

/**
 * Secret Keys. Every value saved or replaced is sealed under a random data key
 * that host protection keeps for the key's owner (version 3, t928), so using,
 * replacing or removing a key never needs a password, PIN or sign-in step; IAM
 * alone decides who may. Values sealed under account passwords before that
 * (versions 1 and 2) keep opening as they did, and the owner's next sign-in
 * makes each one the server can open for them. This class is the public
 * surface; records and their writes live in `SecretKeyStore`, held derived keys
 * in `HeldKeys`, seal upgrades in `SealUpgrades`, and credential changes,
 * including pending seals, in `CredentialChanges`.
 */
export class SecretKeysService {
  static readonly storeKind = "secret.keys";
  static readonly credentialUnlockStoreKind = "secret.credential-unlocks";

  private readonly heldKeys: HeldKeys;
  /** False when `heldKeys` was given: the giver owns it, and an eviction leaves it held. */
  private readonly ownsHeldKeys: boolean;
  private readonly sealer: SecretValueSealer;
  private readonly store: SecretKeyStore;
  /**
   * Which key is the default and which the panel assistant uses: read, set, and
   * `resolveAssistant`, the key and model to call or a plain reason there is none.
   * It names a key and never opens it: the sealed value stays with the unlock and reveal paths.
   */
  readonly modelKeys: ModelKeySettings;
  private readonly upgrades: SealUpgrades;
  private readonly credentialChanges: CredentialChanges;
  /** Unlocks that outlive a process, for a holder's credential (`./unlocks/`). */
  readonly credentialUnlocks: CredentialUnlocks;
  readonly access: SecretKeyAccess;
  private readonly dataKeys: SecretKeyDataKeys;
  private readonly now: () => number;
  private readonly notice = new ModelKeysChangeNotice();
  /** The newest creation time given out, reserved before any await so two saves at once never share one. */
  private lastCreatedAtMs = 0;

  /**
   * `heldKeys`, when given, is custody that outlives this service (a workspace
   * manager's): the service uses it and does not own it. Without it the service
   * holds its keys itself, and they end with it.
   */
  constructor(options: { repository?: Repository; credentialUnlockRepository?: Repository | undefined; vouchForHolder?: SecretKeyHolderVouch | undefined; now?: () => number; passwordKdf?: PasswordKdfOptions; heldKeys?: HeldKeys | undefined; hostProtection?: SecretKeyHostProtection; protectionStoreId?: string; useAuthority?: SecretKeyUseAuthority } = {}) {
    this.heldKeys = options.heldKeys ?? new HeldKeys();
    this.ownsHeldKeys = options.heldKeys === undefined;
    this.now = options.now ?? Date.now;
    this.sealer = new SecretValueSealer(options.passwordKdf);
    this.store = new SecretKeyStore({ repository: options.repository, kind: SecretKeysService.storeKind, sealer: this.sealer });
    this.dataKeys = new SecretKeyDataKeys({ hostProtection: options.hostProtection, storeId: options.protectionStoreId, sealer: this.sealer });
    this.access = new SecretKeyAccess({ store: this.store, heldKeys: this.heldKeys, dataKeys: this.dataKeys, authority: options.useAuthority, now: this.now, summary: toSummary });
    this.modelKeys = new ModelKeySettings({ repository: options.repository, kind: SecretKeysService.storeKind, store: this.store, now: this.now, onChanged: () => this.announceModelKeysChanged() });
    this.credentialUnlocks = new CredentialUnlocks({ repository: options.credentialUnlockRepository, kind: SecretKeysService.credentialUnlockStoreKind, store: this.store, sealer: this.sealer, heldKeys: this.heldKeys, now: this.now, vouch: options.vouchForHolder, onHeld: (held) => this.migrateHeldSession(held.userId, held.sessionId) });
    this.upgrades = new SealUpgrades({ store: this.store, sealer: this.sealer, heldKeys: this.heldKeys, dataKeys: this.dataKeys, onResealed: (recordId, key) => this.quietly(this.credentialUnlocks.resealed(recordId, key)) });
    this.credentialChanges = new CredentialChanges({ store: this.store, sealer: this.sealer, heldKeys: this.heldKeys, upgrades: this.upgrades, dataKeys: this.dataKeys, onCommitted: (userId, keys, actorSessionId) => this.quietly(this.credentialUnlocks.passwordChanged(userId, keys, actorSessionId)) });
  }

  async snapshot(): Promise<SecretKeysSnapshot> {
    await this.store.load();
    await this.modelKeys.load();
    return {
      modelSettings: this.modelKeys.view(),
      keys: this.store.list()
        .map((record) => ({ ...toSummary(record), ...(ModelKeySettings.isModelKey(record) ? { offeredToWorkspace: this.modelKeys.isOffered(record) } : {}) }))
        .sort((left, right) => right.updatedAtMs - left.updatedAtMs || left.name.localeCompare(right.name))
    };
  }

  async getKeySummary(id: string): Promise<SecretKeySummary | null> {
    await this.store.load();
    const record = this.store.get(id);
    return record ? toSummary(record) : null;
  }

  /**
   * Tells `listener` after every committed change to the keys or the model-key
   * choices: a key created, edited, replaced, removed or upgraded so the server
   * can open it, and an offer, default, assistant choice or allowance. Called
   * once the write landed, with nothing in it; returns the function that stops it.
   */
  onModelKeysChanged(listener: () => void): () => void {
    return this.notice.subscribe(listener);
  }

  /**
   * Runs a write whose model access is final only when `run` settles (a key
   * saved or replaced, then its free check recorded): its change notices are
   * held and given once, after `run` returns or throws (`ModelKeysChangeNotice`).
   */
  holdingModelKeysNotice<T>(run: () => Promise<T>): Promise<T> {
    return this.notice.holding(run);
  }

  /**
   * Saves a value for its owner, `createdBy`, sealed under a new random data key
   * that host protection keeps for them (version 3): no password is asked or
   * used, and the server opens it for its owner from then on. Refused in plain
   * words, with nothing written, when nobody would own it or host protection
   * cannot keep it.
   */
  async createKey(input: CreateSecretKeyInput): Promise<SecretKeySummary> {
    await this.store.load();
    // Strictly after every saved key: "oldest first" (the default key) must not fall to a random id between two keys saved in one millisecond.
    const now = Math.max(input.nowMs ?? Date.now(), this.lastCreatedAtMs + 1, ...this.store.list().map((record) => record.createdAtMs + 1));
    this.lastCreatedAtMs = now;
    const id = `secret:${randomUUID()}`;
    const name = cleanRequired(input.name, "name");
    const createdBy = cleanOptional(input.createdBy);
    if (!createdBy) throw new Error(SECRET_KEY_OWNERLESS_REFUSAL);
    if (!this.dataKeys.configured) throw new Error(SECRET_KEY_UNPROTECTED_REFUSAL);
    // Every field that can refuse its input is read before the seal, so nothing throws while its key is unzeroed.
    const fields: Omit<SecretKeyRecord, "sealed"> = {
      id,
      name,
      kind: normalizeKind(input.kind),
      ...(cleanOptional(input.provider) ? { provider: cleanOptional(input.provider) } : {}),
      scope: normalizeScope(input.scope),
      ...(cleanOptional(input.scopeRef) ? { scopeRef: cleanOptional(input.scopeRef) } : {}),
      ...(cleanOptional(input.description) ? { description: cleanOptional(input.description) } : {}),
      enabled: input.enabled ?? true,
      createdBy,
      createdAtMs: now,
      updatedAtMs: now,
      lastRotatedAtMs: now,
      ...(input.metadata ? { metadata: input.metadata } : {}),
      recordType: "secret-key",
      encrypted: true
    };
    const { sealed, key } = this.sealer.sealForHost({ id, value: input.value, updatedAtMs: now });
    let record: SecretKeyRecord;
    try {
      record = await protectedForOwner(this.dataKeys, { ...fields, sealed }, key, createdBy);
      if (!await this.store.commit(record, undefined)) throw new Error("Secret key changed during creation.");
    } finally {
      key.fill(0);
    }
    await this.modelKeys.load();
    await this.modelKeys.ensureDefault();
    this.announceModelKeysChanged();
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
    // An edit leaves the seal as it is, so the editor's own held key still opens it; every other holder is revoked.
    const actorUnlock = this.liveActorUnlock(input.actorSession);
    const kept = actorUnlock?.decryptionKeys.get(existing.id);
    const keptKey = kept ? Buffer.from(kept.decryptionKey) : undefined;
    await this.modelKeys.load();
    const wasDefault = this.modelKeys.defaultKey()?.id === existing.id;
    this.store.set(next);
    this.heldKeys.revokeKey(existing.id);
    if (actorUnlock && keptKey) actorUnlock.decryptionKeys.set(existing.id, { keyUpdatedAtMs: next.updatedAtMs, decryptionKey: keptKey });
    await this.store.persist(existing.id);
    if (ModelKeySettings.isModelKey(existing) && !ModelKeySettings.isModelKey(next)) await this.modelKeys.keyLost({ id: existing.id, wasDefault, phrase: next.enabled ? "is no longer a model key" : "was disabled" });
    else if (ModelKeySettings.isModelKey(next)) await this.modelKeys.ensureDefault();
    this.announceModelKeysChanged();
    return toSummary(next);
  }

  /**
   * Replaces a key's value, sealed as `createKey` seals one (version 3) and
   * protected for the key's owner, with no password: a password-sealed key
   * becomes a host-sealed one. A key that had no owner becomes `actorUserId`'s.
   * A pending seal from a credential change holds the old value, so the
   * rotation drops it, and every holder of the old value is revoked.
   */
  async rotateKey(input: RotateSecretKeyInput): Promise<SecretKeySummary> {
    await this.store.load();
    const existing = this.store.require(input.id);
    const now = Math.max(input.nowMs ?? Date.now(), existing.updatedAtMs + 1);
    const owner = existing.createdBy ?? cleanOptional(input.actorUserId);
    if (!owner) throw new Error(SECRET_KEY_OWNERLESS_REFUSAL);
    if (!this.dataKeys.configured) throw new Error(SECRET_KEY_UNPROTECTED_REFUSAL);
    const { sealed, key } = this.sealer.sealForHost({ id: existing.id, value: input.value, updatedAtMs: now });
    let current = existing;
    try {
      for (;;) {
        const next = await protectedForOwner(this.dataKeys, {
          ...current,
          createdBy: owner,
          updatedAtMs: Math.max(now, current.updatedAtMs + 1),
          lastRotatedAtMs: now,
          sealed,
          hostProtection: undefined,
          pendingSealed: undefined,
          pendingHostProtection: undefined
        }, key, owner);
        if (await this.store.commit(next, current)) {
          current = next;
          break;
        }
        const latest = this.store.get(existing.id);
        if (!latest || latest.lastRotatedAtMs !== current.lastRotatedAtMs || (latest.createdBy ?? owner) !== owner) throw new Error("Secret key changed during rotation.");
        current = latest;
      }
    } finally {
      key.fill(0);
    }
    this.heldKeys.revokeKey(current.id);
    await this.quietly(this.credentialUnlocks.dropKey(current.id));
    this.announceModelKeysChanged();
    return toSummary(current);
  }

  async revealKey(input: RevealSecretKeyInput): Promise<{ key: SecretKeySummary; value: string }> {
    await this.store.load();
    const record = this.store.require(input.id);
    const password = requirePassword(input.authorizationPassword);
    let opened: OpenedRecordSeal | null;
    let recheck: (() => Promise<void>) | undefined;
    if (input.managementProof) {
      const management = await this.access.openForManagement(record, input.managementProof);
      recheck = management.recheck;
      if (management.key) {
        const secret = this.sealer.openRecordWithKey(record, management.key);
        if (!secret) {
          management.key.fill(0);
          throw new Error("Secret key could not be opened");
        }
        opened = { secret, key: management.key, sealed: record.sealed };
      } else opened = await this.credentialChanges.openCurrentOrPending(record, password);
    } else opened = await this.credentialChanges.openCurrentOrPending(record, password);
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
    try {
      await recheck?.();
      if (!sameSecretKeyVersion(this.store.get(record.id), next)) throw new Error("Secret key changed during reveal");
    } catch (error) {
      secret.value = "";
      throw error;
    }
    return { key: toSummary(next), value: secret.value };
  }

  async deleteKey(id: string): Promise<boolean> {
    await this.store.load();
    await this.modelKeys.load();
    const wasDefault = this.modelKeys.defaultKey()?.id === id;
    this.heldKeys.revokeKey(id);
    await this.quietly(this.credentialUnlocks.dropKey(id));
    const deleted = await this.store.delete(id);
    if (deleted) {
      await this.modelKeys.keyLost({ id, wasDefault, phrase: "was removed" });
      this.announceModelKeysChanged();
    }
    return deleted;
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
    const expiryTimer = this.heldKeys.authorizationExpiryTimer(authorizationId, ttlMs);
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

  /**
   * A sign-in's password opens the person's old-format (password-sealed) keys
   * for this session, upgrades each the server can then open with no password,
   * and boxes them to the person's vouched holders. It lifts no client lock:
   * a connected client needs no unlock (t928).
   *
   * `passwordVerified` is accepted and ignored. It once let a lift stand with no
   * key to box; nothing reads it now. `apps/web/src/server/connect/restore-login-keys.ts`
   * still passes it, and its owner can drop it.
   */
  async unlockSession(input: { sessionId: string; userId: string; authorizationPassword: string; expiresAtMs: number; nowMs?: number; passwordVerified?: boolean | undefined }): Promise<{ sessionId: string; expiresAtMs: number; unlockedKeyCount: number }> {
    await this.store.load();
    const nowMs = input.nowMs ?? this.now();
    if (!input.sessionId || !input.userId || !input.authorizationPassword || !Number.isFinite(input.expiresAtMs) || input.expiresAtMs <= nowMs) {
      throw new Error("Secret key session unlock is invalid");
    }
    const proofEnded = this.credentialUnlocks.proofRunning(input.sessionId);
    try {
      return await this.fillSessionUnlock(input, nowMs);
    } finally {
      proofEnded();
    }
  }

  private async fillSessionUnlock(input: { sessionId: string; userId: string; authorizationPassword: string; expiresAtMs: number }, nowMs: number): Promise<{ sessionId: string; expiresAtMs: number; unlockedKeyCount: number }> {
    this.heldKeys.revokeSession(input.sessionId);
    // The timer holds only the custody and the id: never this service, nor `input`, which carries the password.
    const expiryTimer = this.heldKeys.sessionExpiryTimer(input.sessionId, input.expiresAtMs - nowMs);
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
    // A failure here costs a later convenience, never this sign-in: the session is unlocked either way.
    await this.quietly(this.credentialUnlocks.enrolPanelSession(input));
    await this.quietly(this.credentialUnlocks.personProved(input.userId, unlock.decryptionKeys));
    this.heldKeys.notifyChanged(input.userId);
    return { sessionId: input.sessionId, expiresAtMs: input.expiresAtMs, unlockedKeyCount: unlock.decryptionKeys.size };
  }

  async createSessionRevealAuthorization(input: { sessionId: string; userId: string; id: string; ttlMs?: number; nowMs?: number }): Promise<SecretRevealAuthorizationMetadata> {
    await this.store.load();
    const nowMs = input.nowMs ?? this.now();
    const unlock = this.heldKeys.session(input.sessionId);
    if (!unlock || unlock.userId !== input.userId || unlock.expiresAtMs <= nowMs) {
      // Only the caller's own expired unlock is dropped here: naming another
      // user's session id must not lock that user's keys.
      if (unlock && unlock.userId === input.userId) this.heldKeys.revokeSession(input.sessionId);
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
    const expiryTimer = this.heldKeys.authorizationExpiryTimer(authorizationId, ttlMs);
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

  /**
   * Releases a value once for an authorization (a model call's use). A use is
   * not a person's reveal: nothing is written, so `lastRevealedAtMs` says only
   * when the person last revealed the key (`revealKey`).
   */
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
      await this.access.assertAuthorization(authorization, existing);
      if (!sameSecretKeyVersion(this.store.get(input.id), existing) || existing.updatedAtMs !== authorization.keyUpdatedAtMs) throw new Error("Secret reveal authorization is no longer valid");
      const secret = this.sealer.openRecordWithKey(existing, authorization.decryptionKey);
      if (!secret) throw new Error("Invalid secret key payload");
      const active = this.heldKeys.authorization(input.authorizationId);
      if (active !== authorization || authorization.state !== "claimed" || authorization.expiresAtMs <= this.now()) {
        secret.value = "";
        throw new Error("Secret reveal authorization is unavailable");
      }
      await this.access.assertAuthorization(authorization, this.store.require(input.id));
      if (!sameSecretKeyVersion(this.store.get(input.id), existing)) {
        secret.value = "";
        throw new Error("Secret reveal authorization is no longer valid");
      }
      if (this.heldKeys.authorization(input.authorizationId) !== authorization || authorization.expiresAtMs <= this.now()) {
        secret.value = "";
        throw new Error("Secret reveal authorization is unavailable");
      }
      const value = secret.value;
      this.heldKeys.revokeAuthorization(input.authorizationId);
      return { key: toSummary(existing), value };
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

  /** `sessionId`, when it is this person's own live unlock and holds a key; otherwise null. */
  holdingSession(sessionId: string, userId: string, nowMs: number = this.now()): string | null {
    const held = this.heldKeys.session(sessionId);
    return held?.userId === userId && held.expiresAtMs > nowMs && held.decryptionKeys.size > 0 ? sessionId : null;
  }

  /** Recoverability metadata for own keys; current use permission is checked separately. */
  async snapshotFor(caller: { userId: string; sessionId: string | null; holderId?: string | undefined }): Promise<SecretKeysSnapshot> {
    const { keys, modelSettings } = await this.snapshot();
    return {
      ...(modelSettings ? { modelSettings } : {}),
      keys: await Promise.all(keys.map(async (key) => {
        if (key.createdBy !== undefined && key.createdBy !== caller.userId) return { ...key, heldByYou: false };
        const availability = await this.access.availability(this.store.require(key.id), caller);
        return { ...key, availability, ...(key.createdBy === caller.userId ? { heldByYou: true } : {}) };
      }))
    };
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

  /** Legacy custody enumeration; authenticated use never borrows another session through it. */
  unlockedSessionFor(userId: string, nowMs: number = this.now()): string | null {
    if (!userId) return null;
    let best: { sessionId: string; expiresAtMs: number } | null = null;
    // An unlock that opens no key (a wrong password still holds a session) cannot pay for anything.
    for (const held of this.heldKeys.sessionsFor(userId)) {
      if (held.expiresAtMs <= nowMs || held.keyCount === 0) continue;
      if (!best || held.expiresAtMs > best.expiresAtMs) best = held;
    }
    return best?.sessionId ?? null;
  }

  /**
   * Drops `sessionId`'s unlock, and every reveal authorization drawn from it,
   * for `revoker`: the user the unlock belongs to, or an administrator. Knowing
   * a session id is not enough: anyone else is refused and the unlock is kept.
   * False when no unlock is held for that id.
   */
  revokeSessionUnlock(sessionId: string, revoker: SecretKeyUnlockRevoker): boolean {
    const held = this.heldKeys.session(sessionId);
    if (!held) return false;
    if (!revoker.administrator && held.userId !== revoker.userId) throw new Error("Only the session's own user or an administrator can lock its secret keys");
    this.heldKeys.revokeSession(sessionId);
    return true;
  }

  /**
   * Forgets in-flight credential changes, whose stored pending seals are settled
   * at the next unlock or reveal, and, on `shutdown` (the default), revokes every
   * held key. `evict` leaves a given `HeldKeys` held for the next service over
   * the same repository; a service's own `HeldKeys` is revoked in every mode, so
   * no key buffer is left unreachable and unzeroed.
   */
  close(options: { mode?: SecretKeysCloseMode | undefined } = {}): void {
    if (options.mode !== "evict" || this.ownsHeldKeys) this.heldKeys.revokeAll();
    this.credentialChanges.forgetAll();
    this.credentialUnlocks.closeConnections();
  }

  /**
   * Best-effort legacy credential-box propagation. Required host protection and
   * strict enrollment writes never use this helper; a box failure creates no
   * client lock. Log only the name because store errors can contain secret data.
   */
  private async quietly(work: Promise<unknown>): Promise<void> {
    try {
      await work;
    } catch (error) {
      console.warn(`Secret Keys could not update a stored unlock (${error instanceof Error ? error.name : "non_error"}).`);
    }
  }

  /** Tells every `onModelKeysChanged` listener, or the write holding them (`holdingModelKeysNotice`). */
  private announceModelKeysChanged(): void {
    this.notice.announce();
  }

  /** `SecretKeyAccess.migrateHeldSession`, announced when it made a key one the server can open. */
  private async migrateHeldSession(userId: string, sessionId: string): Promise<void> {
    if (await this.access.migrateHeldSession({ userId, sessionId })) this.announceModelKeysChanged();
  }

  /** The acting user's own held, unexpired session unlock, or undefined. */
  private liveActorUnlock(actorSession: SecretKeyActorSession | undefined): HeldSessionUnlock | undefined {
    if (!actorSession) return undefined;
    const unlock = this.heldKeys.session(actorSession.sessionId);
    return unlock && unlock.userId === actorSession.userId && unlock.expiresAtMs > this.now() ? unlock : undefined;
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
      // The session's copy can be revoked (and zeroed) at any await; the upgrade below uses its own.
      const openedKey = Buffer.from(opened.key);
      unlock.decryptionKeys.set(recordId, { keyUpdatedAtMs: current.updatedAtMs, decryptionKey: opened.key });
      let upgraded: boolean;
      try {
        // A failed write leaves the settled record in memory; after a restart the stored pending seal is settled again.
        await settling.catch(() => undefined);
        upgraded = await upgradeOpenedRecord({ store: this.store, dataKeys: this.dataKeys }, { recordId, openedSeal: opened.sealed, key: openedKey, userId: unlock.userId });
      } finally {
        openedKey.fill(0);
      }
      await this.upgrades.upgrade(recordId, opened.sealed, opened.secret, password, unlock.userId);
      await this.migrateHeldSession(unlock.userId, unlock.sessionId);
      if (upgraded) this.announceModelKeysChanged();
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

/** `SecretKeyDataKeys.protectHostSealed`, with an unavailable protection key said in plain words. */
async function protectedForOwner(dataKeys: SecretKeyDataKeys, record: SecretKeyRecord, key: Buffer, owner: string): Promise<SecretKeyRecord> {
  try {
    return await dataKeys.protectHostSealed(record, key, owner);
  } catch (error) {
    if (error instanceof SecretKeyAccessUnavailableError && error.code === "host_protection_unavailable") throw new Error(SECRET_KEY_UNPROTECTED_REFUSAL);
    throw error;
  }
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

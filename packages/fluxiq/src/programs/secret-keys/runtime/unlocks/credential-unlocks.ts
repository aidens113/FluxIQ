import { createHash } from "node:crypto";
import type { ModelKeyLockReason } from "@fluxiq/contracts/automation";
import type { JsonObject } from "../../../../core/index.ts";
import { createRecord, type Repository } from "../../../database-manager/index.ts";
import type { SecretKeyCredentialHolder, SecretKeyCredentialUnlockBox, SecretKeyCredentialUnlockRecord, SecretKeyCredentialUnlockWrap, SecretKeyRecord, SecretKeySessionEnd, SecretKeyUnlockPersonRecord } from "../../types.ts";
import type { HeldKeys, HeldSessionUnlock } from "../held-keys.ts";
import type { SecretKeyStore } from "../key-store.ts";
import { RecordWriteQueue } from "../record-write-queue.ts";
import type { SecretValueSealer } from "../value-sealer.ts";
import { boxCredentialUnlockKey, newCredentialUnlockKeyPair, openCredentialUnlockBox, unwrapCredentialUnlockPrivateKey, wrapCredentialUnlockPrivateKey, type CredentialUnlockHolderBinding } from "./crypto.ts";

/** The SHA-256 digest Identity Access stores a session under (`identity-access/runtime/session-digest.ts`); a runtime test pins the two together. */
export function secretKeySessionDigest(sessionId: string): string {
  return createHash("sha256").update(sessionId, "utf8").digest("hex");
}

/** The stored id of a panel session's unlock: its digest, never its raw id. */
export function secretKeyPanelHolderId(digest: string): string {
  return `panel-session:${digest}`;
}

/** Data keys a person just proved themselves for, by record id. */
export type SecretKeyProvedKeys = ReadonlyMap<string, { keyUpdatedAtMs: number; decryptionKey: Buffer }>;

/**
 * Unlocks that outlive a process: **a holder's unlock lasts as long as its
 * credential.** Each presentation of a verified credential opens the data keys
 * boxed for that holder and holds them in memory, with no password and no prompt.
 * Whatever the person proves themselves for (a sign-in, a new or rotated key, a
 * password change) is boxed to their holders' public keys, so it reaches a browser
 * whose credential is not present.
 *
 * The store holds only ciphertext. Opening anything needs a credential, which the
 * store holds only as a digest, so the store alone opens nothing, and a credential
 * alone has nothing to open without the store.
 *
 * The caller verifies a credential before presenting it. A presentation marked
 * `verified` may re-key a record the credential cannot open (a restored store, a
 * rotation whose write failed), which leaves the holder locked and opens nothing.
 */
export class CredentialUnlocks {
  private readonly records = new Map<string, SecretKeyCredentialUnlockRecord>();
  private readonly people = new Map<string, SecretKeyUnlockPersonRecord>();
  private readonly writes = new RecordWriteQueue();
  private readonly repository: Repository | undefined;
  private readonly kind: string;
  private readonly store: SecretKeyStore;
  private readonly sealer: SecretValueSealer;
  private readonly heldKeys: HeldKeys;
  private readonly now: () => number;
  /** Paired clients connected now: the only ones a key is placed in memory for, without their credential, the moment the person proves themselves. */
  private readonly connected = new Set<string>();
  private loading: Promise<void> | undefined;

  constructor(options: { repository: Repository | undefined; kind: string; store: SecretKeyStore; sealer: SecretValueSealer; heldKeys: HeldKeys; now: () => number }) {
    this.repository = options.repository;
    this.kind = options.kind;
    this.store = options.store;
    this.sealer = options.sealer;
    this.heldKeys = options.heldKeys;
    this.now = options.now;
  }

  load(): Promise<void> {
    this.loading ??= this.read().catch((error: unknown) => {
      this.loading = undefined;
      throw error;
    });
    return this.loading;
  }

  /**
   * A credential was presented: this holder's boxed keys are opened and held.
   * Cheap when they already are, since this runs on every request a client makes:
   * no cryptography until something changed.
   */
  async presentCredential(holder: SecretKeyCredentialHolder, credential: string, options: { verified?: boolean | undefined } = {}): Promise<{ unlockedKeyCount: number }> {
    await this.store.load();
    await this.load();
    const nowMs = this.now();
    if (holder.expiresAtMs <= nowMs) return { unlockedKeyCount: 0 };
    const binding: CredentialUnlockHolderBinding = { holderId: holder.holderId, userId: holder.userId };
    const existing = this.records.get(holder.holderId);
    const record = existing?.userId === holder.userId ? existing : undefined;
    // Only a credential its owner verified may make or replace a record.
    if (!record && options.verified !== true) return { unlockedKeyCount: 0 };
    const held = this.heldKeys.session(holder.heldAs);
    if (record && held?.userId === holder.userId && held.decryptionKeys.size >= Object.keys(record.boxes).length) {
      if (holder.holderKind === "paired-client") this.connected.add(holder.heldAs);
      // Its life slid: what is held goes on as it is, so a call in flight is not cut.
      if (record.expiresAtMs !== holder.expiresAtMs) {
        this.heldKeys.extendSession(holder.heldAs, holder.expiresAtMs, holder.expiresAtMs - nowMs);
        this.records.set(record.id, { ...record, expiresAtMs: holder.expiresAtMs, updatedAtMs: nowMs });
        await this.persist(record.id);
      }
      return { unlockedKeyCount: held.decryptionKeys.size };
    }
    const opened = record ? openingWrap(record.wraps, credential, binding) : null;
    if (record && !opened && options.verified !== true) return { unlockedKeyCount: 0 };
    let current: SecretKeyCredentialUnlockRecord;
    if (opened && record) {
      // Every wrap stays until the gateway says which credential is confirmed (`confirmCredential`): the reply that carried the newest may never have arrived.
      current = { ...record, expiresAtMs: holder.expiresAtMs, updatedAtMs: nowMs, ...(holder.label ? { label: holder.label } : {}) };
    } else {
      // A first presentation, or a record this verified credential cannot open: nothing it held can be read, so a lock on it stays.
      current = this.newRecord(holder, credential, record);
    }
    this.records.set(current.id, current);
    try {
      this.hold(holder, current, opened?.privateKeyDer ?? null);
    } finally {
      opened?.privateKeyDer.fill(0);
    }
    this.seedFromLiveUnlocks(holder.holderId, holder.userId);
    await this.persist(current.id);
    this.heldKeys.notifyChanged(holder.userId);
    return { unlockedKeyCount: this.heldKeys.session(holder.heldAs)?.decryptionKeys.size ?? 0 };
  }

  /** A signed-in panel session spoke: its cookie, which only the browser holds, brings its unlock back after a restart. */
  presentPanelSession(input: { sessionId: string; userId: string; expiresAtMs: number }): Promise<{ unlockedKeyCount: number }> {
    return this.presentCredential(panelSessionHolder(input), input.sessionId);
  }

  /** Stores a panel session's unlock at its sign-in, whose keys its session already holds, so they can come back. */
  async enrolPanelSession(input: { sessionId: string; userId: string; expiresAtMs: number }): Promise<void> {
    const holder = panelSessionHolder(input);
    const credential = input.sessionId;
    await this.load();
    const existing = this.records.get(holder.holderId);
    const opened = existing?.userId === holder.userId ? openingWrap(existing.wraps, credential, holder) : null;
    if (opened) {
      opened.privateKeyDer.fill(0);
      return;
    }
    const record = this.newRecord(holder, credential, undefined);
    this.records.set(record.id, record);
    await this.persist(record.id);
  }

  /**
   * Written ahead of a holder's new credential digest: the private key under the
   * next credential, beside the current wrap. A crash either side of that digest
   * leaves the credential Core accepts able to open it. False when there is
   * nothing to carry over, or the previous credential does not open it.
   */
  async rotateCredential(input: { holderId: string; userId: string; previousCredential: string; nextCredential: string }): Promise<boolean> {
    await this.load();
    const record = this.records.get(input.holderId);
    if (record?.userId !== input.userId) return false;
    const binding: CredentialUnlockHolderBinding = { holderId: input.holderId, userId: input.userId };
    const opened = openingWrap(record.wraps, input.previousCredential, binding);
    if (!opened) return false;
    try {
      this.records.set(record.id, { ...record, wraps: [opened.wrap, wrapCredentialUnlockPrivateKey(opened.privateKeyDer, input.nextCredential, binding)], updatedAtMs: this.now() });
    } finally {
      opened.privateKeyDer.fill(0);
    }
    await this.persist(record.id);
    return true;
  }

  /**
   * The client's credential is confirmed in use: the wrap under any other goes, so a
   * credential it replaced opens nothing from here on. `credential` names the
   * confirmed one; without it, the newest written, which is what a client that says
   * it received its credential received.
   */
  async confirmCredential(input: { holderId: string; userId: string; credential?: string | undefined }): Promise<void> {
    await this.load();
    const record = this.records.get(input.holderId);
    if (record?.userId !== input.userId || record.wraps.length < 2) return;
    let keep = record.wraps.at(-1);
    if (input.credential !== undefined) {
      const opened = openingWrap(record.wraps, input.credential, { holderId: input.holderId, userId: input.userId });
      opened?.privateKeyDer.fill(0);
      keep = opened?.wrap;
    }
    if (!keep) return;
    this.records.set(record.id, { ...record, wraps: [keep], updatedAtMs: this.now() });
    await this.persist(record.id);
  }

  /** The client went away. Its unlock leaves memory; its credential brings it back. Nothing stored changes. */
  release(heldAs: string): void {
    this.connected.delete(heldAs);
    this.heldKeys.revokeSession(heldAs);
  }

  /** A holder's trust ended (forgotten, revoked): nothing is left to open. */
  async forget(holderId: string, heldAs: string = holderId): Promise<void> {
    await this.load();
    this.release(heldAs);
    await this.drop(holderId);
  }

  /** Locks a holder until the person's own explicit unlock: its keys leave memory and the store. */
  async lock(holderId: string, reason: ModelKeyLockReason, heldAs: string = holderId): Promise<void> {
    await this.load();
    this.heldKeys.revokeSession(heldAs);
    const record = this.records.get(holderId);
    if (!record) return;
    const nowMs = this.now();
    this.records.set(holderId, { ...record, boxes: {}, lockedAtMs: nowMs, lockReason: reason, updatedAtMs: nowMs });
    await this.persist(holderId);
    this.heldKeys.notifyChanged(record.userId);
  }

  /** Every holder of one person: a password reset nobody proved the old password for, a disabled account, every session revoked. */
  async lockPerson(userId: string, reason: ModelKeyLockReason): Promise<void> {
    await this.load();
    for (const record of [...this.records.values()]) {
      if (record.userId !== userId) continue;
      if (record.holderKind === "paired-client") await this.lock(record.holderId, reason);
      else await this.drop(record.holderId);
    }
    if (reason === "password_reset") await this.notePerson(userId, { passwordResetAtMs: this.now() });
  }

  /** The one thing to say about why this person's key is locked here. `holderId` is the paired client asking, when one is. */
  lockReasonFor(input: { userId: string; holderId?: string | undefined; ownKeys: readonly SecretKeyRecord[] }): ModelKeyLockReason {
    const person = this.people.get(input.userId);
    const resetAt = person?.passwordResetAtMs;
    if (resetAt !== undefined && input.ownKeys.every((key) => key.lastRotatedAtMs <= resetAt)) return "password_reset";
    const record = input.holderId === undefined ? undefined : this.records.get(input.holderId);
    // A reset with a key added since: what it locked stays locked, and adding one is no longer what it needs.
    if (record?.userId === input.userId && record.lockedAtMs !== undefined) return record.lockReason === "password_reset" ? "unknown" : record.lockReason ?? "unknown";
    return person?.firstUnlockToldAtMs === undefined ? "first_unlock" : "unknown";
  }

  /** They have been told why their key needs their password once: a thread does not say it a second time. The setup step itself stays until it is done. */
  async noteFirstUnlockTold(userId: string): Promise<void> {
    await this.load();
    if (this.people.get(userId)?.firstUnlockToldAtMs === undefined) await this.notePerson(userId, { firstUnlockToldAtMs: this.now() });
  }

  /**
   * A panel session ended. Its own stored unlock goes. A browser it approved
   * locks: that is signing out of that browser. An administrator's revoke stops
   * there. A person's own sign-out also locks a browser whose approving session
   * has already ended, because nothing else links that browser to any session and
   * "still unlocked after I signed out" is the failure that must not happen; one
   * explicit unlock restores it.
   */
  async sessionEnded(end: SecretKeySessionEnd): Promise<void> {
    await this.load();
    if (end.wholeUserId) {
      await this.lockPerson(end.wholeUserId, "sessions_ended");
      return;
    }
    const digest = end.digest;
    if (!digest) return;
    await this.drop(secretKeyPanelHolderId(digest));
    for (const record of [...this.records.values()]) {
      if (record.holderKind !== "paired-client") continue;
      const approvedHere = record.approvingSessionDigest === digest;
      const ownSignOut = !end.administrator && end.revokerUserId === record.userId;
      const linkEnded = record.approvingSessionDigest === undefined || (end.liveSessionDigests !== undefined && !end.liveSessionDigests.has(record.approvingSessionDigest));
      if (approvedHere || (ownSignOut && linkEnded)) await this.lock(record.holderId, end.administrator ? "administrator" : "signed_out");
    }
  }

  /**
   * The person proved themselves for these keys. Each is boxed to their holders
   * and placed in the memory of those connected. `explicit` is their own unlock,
   * the only thing that lifts a lock: a sign-in elsewhere does not, so a browser
   * that was signed out stays locked until they say otherwise.
   */
  async personProved(userId: string, keys: SecretKeyProvedKeys, options: { explicit: boolean }): Promise<void> {
    // A password that opened nothing proved nothing, so it lifts nothing.
    if (keys.size === 0) return;
    await this.load();
    const changed: string[] = [];
    for (const record of [...this.records.values()]) {
      if (record.userId !== userId) continue;
      if (record.lockedAtMs !== undefined && !options.explicit) continue;
      const boxes = { ...record.boxes };
      for (const [recordId, key] of keys) {
        boxes[recordId] = boxCredentialUnlockKey(key.decryptionKey, record.publicKey, { holderId: record.holderId, userId, recordId });
        this.placeInMemory(record, recordId, key);
      }
      const next: SecretKeyCredentialUnlockRecord = { ...record, boxes, updatedAtMs: this.now() };
      delete next.lockedAtMs;
      delete next.lockReason;
      this.records.set(record.id, next);
      changed.push(record.id);
    }
    await Promise.all(changed.map((id) => this.persist(id)));
    this.heldKeys.notifyChanged(userId);
  }

  /** A record's seal changed under the same value (an upgrade): each holder that had a box gets one for the new seal. Never adds a holder. */
  async resealed(recordId: string, key: Buffer): Promise<void> {
    await this.load();
    const changed: string[] = [];
    for (const record of [...this.records.values()]) {
      if (!record.boxes[recordId]) continue;
      this.records.set(record.id, { ...record, boxes: { ...record.boxes, [recordId]: boxCredentialUnlockKey(key, record.publicKey, { holderId: record.holderId, userId: record.userId, recordId }) }, updatedAtMs: this.now() });
      changed.push(record.id);
    }
    await Promise.all(changed.map((id) => this.persist(id)));
  }

  /** The record's box goes from every holder: a deletion or a rotation. */
  async dropKey(recordId: string): Promise<void> {
    await this.load();
    const changed: string[] = [];
    for (const record of [...this.records.values()]) {
      if (!record.boxes[recordId]) continue;
      const boxes = { ...record.boxes };
      delete boxes[recordId];
      this.records.set(record.id, { ...record, boxes, updatedAtMs: this.now() });
      changed.push(record.id);
    }
    await Promise.all(changed.map((id) => this.persist(id)));
  }

  /** The names of a person's paired clients that are locked, for the panel to show before it asks for their password. */
  async lockedLabelsFor(userId: string): Promise<string[]> {
    await this.load();
    return [...this.records.values()].filter((record) => record.userId === userId && record.holderKind === "paired-client" && record.lockedAtMs !== undefined).map((record) => record.label ?? "A paired client");
  }

  /** Forgets who is connected, for a shutdown. */
  closeConnections(): void {
    this.connected.clear();
  }

  /** A holder just verified takes what the person's live panel unlocks hold: proof they gave for the same person, and a locked holder takes nothing. */
  private seedFromLiveUnlocks(holderId: string, userId: string): void {
    const record = this.records.get(holderId);
    if (!record || record.lockedAtMs !== undefined) return;
    const nowMs = this.now();
    const boxes = { ...record.boxes };
    let added = false;
    for (const unlock of this.heldKeys.liveUnlocksFor(userId, nowMs)) {
      if (unlock.credentialHolder === "paired-client") continue;
      for (const [recordId, key] of unlock.decryptionKeys) {
        if (boxes[recordId] || this.store.get(recordId)?.updatedAtMs !== key.keyUpdatedAtMs) continue;
        boxes[recordId] = boxCredentialUnlockKey(key.decryptionKey, record.publicKey, { holderId, userId, recordId });
        this.placeInMemory(record, recordId, key);
        added = true;
      }
    }
    if (added) this.records.set(holderId, { ...record, boxes, updatedAtMs: nowMs });
  }

  /** Replaces the holder's unlock in memory with what its boxes open, and drops any box that no longer opens its record. */
  private hold(holder: SecretKeyCredentialHolder, record: SecretKeyCredentialUnlockRecord, privateKeyDer: Buffer | null): void {
    this.heldKeys.revokeSession(holder.heldAs);
    const unlock: HeldSessionUnlock = {
      sessionId: holder.heldAs,
      userId: holder.userId,
      expiresAtMs: holder.expiresAtMs,
      credentialHolder: holder.holderKind,
      decryptionKeys: new Map(),
      expiryTimer: this.heldKeys.sessionExpiryTimer(holder.heldAs, holder.expiresAtMs - this.now())
    };
    this.heldKeys.holdSession(unlock);
    if (holder.holderKind === "paired-client") this.connected.add(holder.heldAs);
    if (!privateKeyDer) return;
    const boxes = { ...record.boxes };
    for (const [recordId, box] of Object.entries(record.boxes)) {
      const opened = this.openBox(record, recordId, box, privateKeyDer);
      if (opened) unlock.decryptionKeys.set(recordId, opened);
      else delete boxes[recordId];
    }
    if (Object.keys(boxes).length !== Object.keys(record.boxes).length) this.records.set(record.id, { ...record, boxes });
  }

  private openBox(record: SecretKeyCredentialUnlockRecord, recordId: string, box: SecretKeyCredentialUnlockBox, privateKeyDer: Buffer): { keyUpdatedAtMs: number; decryptionKey: Buffer } | null {
    const current = this.store.get(recordId);
    if (!current) return null;
    const key = openCredentialUnlockBox(box, privateKeyDer, { holderId: record.holderId, userId: record.userId, recordId });
    if (!key) return null;
    if (!this.opensCurrentSeal(current, key)) {
      key.fill(0);
      return null;
    }
    return { keyUpdatedAtMs: current.updatedAtMs, decryptionKey: key };
  }

  /** The invariant of held keys: a key held opens its record's current seal. The value it opened is wiped at once. */
  private opensCurrentSeal(record: SecretKeyRecord, key: Buffer): boolean {
    const secret = this.sealer.openRecordWithKey(record, key);
    if (!secret) return false;
    secret.value = "";
    return true;
  }

  private placeInMemory(record: SecretKeyCredentialUnlockRecord, recordId: string, key: { keyUpdatedAtMs: number; decryptionKey: Buffer }): void {
    if (record.holderKind !== "paired-client" || !this.connected.has(record.holderId)) return;
    let unlock = this.heldKeys.session(record.holderId);
    if (!unlock) {
      unlock = { sessionId: record.holderId, userId: record.userId, expiresAtMs: record.expiresAtMs, credentialHolder: record.holderKind, decryptionKeys: new Map(), expiryTimer: this.heldKeys.sessionExpiryTimer(record.holderId, record.expiresAtMs - this.now()) };
      this.heldKeys.holdSession(unlock);
    }
    unlock.decryptionKeys.get(recordId)?.decryptionKey.fill(0);
    unlock.decryptionKeys.set(recordId, { keyUpdatedAtMs: key.keyUpdatedAtMs, decryptionKey: Buffer.from(key.decryptionKey) });
  }

  /** A new key pair for `holder`, its private half wrapped under `credential`, with no boxes. A lock on the record it replaces stays. */
  private newRecord(holder: SecretKeyCredentialHolder, credential: string, previous: SecretKeyCredentialUnlockRecord | undefined): SecretKeyCredentialUnlockRecord {
    const pair = newCredentialUnlockKeyPair();
    try {
      const approvingSessionDigest = holder.approvingSessionDigest ?? previous?.approvingSessionDigest;
      const label = holder.label ?? previous?.label;
      return {
        recordType: "secret-key-credential-unlock",
        id: holder.holderId,
        holderId: holder.holderId,
        holderKind: holder.holderKind,
        userId: holder.userId,
        expiresAtMs: holder.expiresAtMs,
        publicKey: pair.publicKey,
        wraps: [wrapCredentialUnlockPrivateKey(pair.privateKeyDer, credential, { holderId: holder.holderId, userId: holder.userId })],
        boxes: {},
        ...(approvingSessionDigest ? { approvingSessionDigest } : {}),
        ...(label ? { label } : {}),
        ...(previous?.lockedAtMs !== undefined ? { lockedAtMs: previous.lockedAtMs } : {}),
        ...(previous?.lockReason !== undefined ? { lockReason: previous.lockReason } : {}),
        updatedAtMs: this.now()
      };
    } finally {
      pair.privateKeyDer.fill(0);
    }
  }

  private async notePerson(userId: string, note: Partial<Pick<SecretKeyUnlockPersonRecord, "firstUnlockToldAtMs" | "passwordResetAtMs">>): Promise<void> {
    const id = `person:${userId}`;
    const next: SecretKeyUnlockPersonRecord = { recordType: "secret-key-unlock-person", id, userId, ...this.people.get(userId), ...note };
    this.people.set(userId, next);
    const repository = this.repository;
    if (repository) await this.writes.enqueue(id, () => repository.put(createRecord({ id, kind: this.kind, data: next as unknown as JsonObject })));
  }

  private persist(id: string): Promise<void> {
    const repository = this.repository;
    if (!repository) return Promise.resolve();
    return this.writes.enqueue(id, async () => {
      const current = this.records.get(id);
      if (current) await repository.put(createRecord({ id: current.id, kind: this.kind, data: current as unknown as JsonObject }));
    });
  }

  private async drop(id: string): Promise<void> {
    const record = this.records.get(id);
    if (!record) return;
    this.records.delete(id);
    const repository = this.repository;
    if (repository) await this.writes.enqueue(id, () => repository.delete(id, {}));
    this.heldKeys.notifyChanged(record.userId);
  }

  private async read(): Promise<void> {
    if (!this.repository) return;
    const rows = await this.repository.list({});
    this.records.clear();
    this.people.clear();
    const nowMs = this.now();
    for (const row of rows) {
      if (isUnlockPersonRecord(row.data)) this.people.set(row.data.userId, row.data);
      if (!isCredentialUnlockRecord(row.data)) continue;
      // A row past its credential's life opens nothing, and it goes on the next read that can delete it.
      if (row.data.expiresAtMs > nowMs) this.records.set(row.id, row.data);
      else await this.repository.delete(row.id, {});
    }
  }
}

/** A panel session as a holder: stored under its digest, held under its own id, as a sign-in holds it. */
function panelSessionHolder(input: { sessionId: string; userId: string; expiresAtMs: number }): SecretKeyCredentialHolder {
  return { holderKind: "panel-session", holderId: secretKeyPanelHolderId(secretKeySessionDigest(input.sessionId)), heldAs: input.sessionId, userId: input.userId, expiresAtMs: input.expiresAtMs };
}

/** The wrap `credential` opens, and what it opened. Whoever holds `privateKeyDer` zeroes it. */
function openingWrap(wraps: readonly SecretKeyCredentialUnlockWrap[], credential: string, binding: CredentialUnlockHolderBinding): { wrap: SecretKeyCredentialUnlockWrap; privateKeyDer: Buffer } | null {
  for (const wrap of wraps) {
    const privateKeyDer = unwrapCredentialUnlockPrivateKey(wrap, credential, binding);
    if (privateKeyDer) return { wrap, privateKeyDer };
  }
  return null;
}

function isUnlockPersonRecord(value: unknown): value is SecretKeyUnlockPersonRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const record = value as Partial<SecretKeyUnlockPersonRecord>;
  return record.recordType === "secret-key-unlock-person" && typeof record.userId === "string";
}

/** The read guard for stored records: anything else is skipped, so a tampered row asks for nothing. */
function isCredentialUnlockRecord(value: unknown): value is SecretKeyCredentialUnlockRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const record = value as Partial<SecretKeyCredentialUnlockRecord>;
  return record.recordType === "secret-key-credential-unlock"
    && typeof record.holderId === "string"
    && record.id === record.holderId
    && (record.holderKind === "paired-client" || record.holderKind === "panel-session")
    && typeof record.userId === "string"
    && typeof record.expiresAtMs === "number"
    && typeof record.publicKey === "string"
    && Array.isArray(record.wraps) && record.wraps.length > 0
    && Boolean(record.boxes) && typeof record.boxes === "object" && !Array.isArray(record.boxes);
}

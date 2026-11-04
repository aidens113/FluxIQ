import { createHash } from "node:crypto";
import type { ModelKeyLockReason } from "@fluxiq/contracts/automation";
import { PAIRED_CLIENT_UNLOCK_PREFIX } from "@fluxiq/contracts/platform";
import type { JsonObject } from "../../../../core/index.ts";
import { createRecord, type Repository } from "../../../database-manager/index.ts";
import type { SecretKeyCredentialHolder, SecretKeyCredentialUnlockBox, SecretKeyCredentialUnlockGeneration, SecretKeyCredentialUnlockRecord, SecretKeyRecord, SecretKeyLockedClient, SecretKeySessionEnd, SecretKeyUnlockPersonRecord } from "../../types.ts";
import type { HeldKeys, HeldSessionUnlock } from "../held-keys.ts";
import type { SecretKeyStore } from "../key-store.ts";
import { RecordWriteQueue } from "../record-write-queue.ts";
import type { SecretValueSealer } from "../value-sealer.ts";
import { SecretKeyUnlockTickets } from "./unlock-tickets.ts";
import { boxCredentialUnlockKey, newCredentialUnlockKeyPair, openCredentialUnlockBox, unwrapCredentialUnlockPrivateKey, wrapCredentialUnlockPrivateKey, type CredentialUnlockHolderBinding } from "./crypto.ts";

/** The SHA-256 digest Identity Access stores a session under (`identity-access/runtime/session-digest.ts`); a runtime test pins the two together. */
export function secretKeySessionDigest(sessionId: string): string {
  return createHash("sha256").update(sessionId, "utf8").digest("hex");
}

/** The stored id of a panel session's unlock: its digest, never its raw id. */
export function secretKeyPanelHolderId(digest: string): string {
  return `panel-session:${digest}`;
}

/** The stored id of a paired client's unlock. Public, so it never reaches a reveal: its unlock is held under a random handle (`HeldKeys.pairedHandle`). */
export function secretKeyPairedHolderId(trustedClientId: string): string {
  return `${PAIRED_CLIENT_UNLOCK_PREFIX}${trustedClientId}`;
}

/** Data keys a person just proved themselves for, by record id. */
export type SecretKeyProvedKeys = ReadonlyMap<string, { keyUpdatedAtMs: number; decryptionKey: Buffer }>;

/**
 * Whether the host stands behind a stored holder: a paired row must be an active
 * trusted client of that person, a panel row a live session of theirs. A stored row
 * alone proves nothing, because anyone who can write the store could add one.
 */
export type SecretKeyHolderVouch = (record: Pick<SecretKeyCredentialUnlockRecord, "holderId" | "holderKind" | "userId">) => boolean | Promise<boolean>;

/** What a proof reaches. `lift` names the locked clients the person chose; nothing else that is locked is touched. `passwordVerified` says the caller checked it, so a lift stands even with no key to box yet. */
type ProofReach = { lift?: ReadonlySet<string> | undefined; passwordVerified?: boolean | undefined };

/** A generation a credential opened, and its private key. Whoever holds `privateKeyDer` zeroes it. */
type OpenedGeneration = { generation: "current" | "pending"; boxes: Readonly<Record<string, SecretKeyCredentialUnlockBox>>; privateKeyDer: Buffer };

/**
 * Unlocks that outlive a process: **a holder's unlock lasts as long as its
 * credential.** Each presentation of a verified credential opens the data keys
 * boxed for that holder and holds them in memory, with no password and no prompt.
 *
 * **A holder gets a key only on a proof.** A paired client starts locked. The person's
 * password at its approval, or their explicit unlock naming it, lifts the lock. After
 * that, whatever they prove themselves for (a sign-in, a new or rotated key) is boxed
 * to it. Nothing is copied from a live session, so a stolen cookie cannot mint a holder.
 *
 * The store holds only ciphertext. Opening anything needs a credential, which the
 * store holds only as a digest, so reading the store opens nothing. Writing it is
 * different: a row with an attacker's public key would be boxed the person's key, so
 * only a holder the host vouches for is ever boxed to (`SecretKeyHolderVouch`).
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
  /** Unset, no holder is vouched for and nothing is boxed: failing closed if a host forgets to bind it. */
  private vouch: SecretKeyHolderVouch | undefined;
  /** Paired clients connected now: the only ones a key is placed in memory for, without their credential, the moment the person proves themselves. */
  private readonly connected = new Set<string>();
  /** Holders forgotten in this process: a reconnect already past the gateway's checks when its trust ended cannot bring one back. */
  private readonly forgotten = new Set<string>();
  /** Sessions a person is proving themselves on now, and how many proofs are running on each. */
  private readonly proofsRunning = new Map<string, number>();
  private readonly unlockTickets: SecretKeyUnlockTickets;
  /** Sessions ended by their person's password change. Work one of them started may not fall back on the person's other unlocks. */
  private readonly endedByPasswordChange = new Set<string>();
  /** Locks in memory whose write the store refused. */
  private readonly locksUnwritten = new Set<string>();
  private loading: Promise<void> | undefined;

  constructor(options: { repository: Repository | undefined; kind: string; store: SecretKeyStore; sealer: SecretValueSealer; heldKeys: HeldKeys; now: () => number; vouch?: SecretKeyHolderVouch | undefined }) {
    this.repository = options.repository;
    this.kind = options.kind;
    this.store = options.store;
    this.sealer = options.sealer;
    this.heldKeys = options.heldKeys;
    this.now = options.now;
    this.unlockTickets = new SecretKeyUnlockTickets(options.now);
    this.vouch = options.vouch;
  }

  /** Connects the host's answer about which holders are real. The host builds this service before the things it asks. */
  bindVouch(vouch: SecretKeyHolderVouch): void {
    this.vouch = vouch;
  }

  load(): Promise<void> {
    this.loading ??= this.read().catch((error: unknown) => {
      this.loading = undefined;
      throw error;
    });
    return this.loading;
  }

  /**
   * A password is being checked for this session. A panel page keeps speaking while it runs, and
   * each request presents the same session: that must not replace the unlock the proof is filling.
   * Call what this returns when the proof ends.
   */
  proofRunning(heldAs: string): () => void {
    this.proofsRunning.set(heldAs, (this.proofsRunning.get(heldAs) ?? 0) + 1);
    return () => {
      const left = (this.proofsRunning.get(heldAs) ?? 1) - 1;
      if (left > 0) this.proofsRunning.set(heldAs, left);
      else this.proofsRunning.delete(heldAs);
    };
  }

  /** This session ended because its person changed their password. Remembered for this process, which is as long as anything it started can run. */
  noteEndedByPasswordChange(sessionId: string): void {
    this.endedByPasswordChange.add(sessionId);
  }

  /** Whether work started from this session may still use another unlock of the person's. A plain sign-out may; a password change, which often means they suspect someone, may not. */
  mayFallBack(sessionId: string | undefined): boolean {
    return sessionId === undefined || !this.endedByPasswordChange.has(sessionId);
  }

  /** The id a paired client's unlock is held under in this process. Random, so no one can name another person's. */
  heldHandleFor(holderId: string): string {
    return this.heldKeys.pairedHandle(holderId);
  }

  /** The stored holder a held handle stands for, when it is a paired client's. */
  holderIdOfHandle(handle: string): string | undefined {
    return this.heldKeys.pairedHolderOf(handle);
  }

  /**
   * A credential was presented: this holder's boxed keys are opened and held.
   * Cheap when they already are, since this runs on every request a client makes:
   * no cryptography until something changed.
   */
  async presentCredential(holder: SecretKeyCredentialHolder, credential: string, options: { verified?: boolean | undefined } = {}): Promise<{ unlockedKeyCount: number }> {
    await this.store.load();
    await this.load();
    if (this.locksUnwritten.size > 0) await this.writeUnwrittenLocks();
    const nowMs = this.now();
    if (holder.expiresAtMs <= nowMs || this.forgotten.has(holder.holderId)) return { unlockedKeyCount: 0 };
    const binding: CredentialUnlockHolderBinding = { holderId: holder.holderId, userId: holder.userId };
    const heldAs = this.heldAs(holder);
    if (this.proofsRunning.has(heldAs)) return { unlockedKeyCount: this.heldKeys.session(heldAs)?.decryptionKeys.size ?? 0 };
    const existing = this.records.get(holder.holderId);
    const record = existing?.userId === holder.userId ? existing : undefined;
    // Only a credential its owner verified may make or replace a record.
    if (!record && options.verified !== true) return { unlockedKeyCount: 0 };
    const held = this.heldKeys.session(heldAs);
    if (record && held?.userId === holder.userId && held.decryptionKeys.size >= Object.keys(record.boxes).length) {
      if (holder.holderKind === "paired-client") this.connected.add(heldAs);
      // Its life slid: what is held goes on as it is, so a call in flight is not cut.
      if (record.expiresAtMs !== holder.expiresAtMs) {
        this.heldKeys.extendSession(heldAs, holder.expiresAtMs, holder.expiresAtMs - nowMs);
        this.records.set(record.id, { ...record, expiresAtMs: holder.expiresAtMs, lastUsedAtMs: nowMs, updatedAtMs: nowMs });
        await this.persist(record.id);
      }
      return { unlockedKeyCount: held.decryptionKeys.size };
    }
    const opened = record ? openingGeneration(record, credential, binding) : null;
    if (record && !opened && options.verified !== true) return { unlockedKeyCount: 0 };
    let current: SecretKeyCredentialUnlockRecord;
    if (opened && record) {
      // Every generation stays until the gateway says which credential is confirmed (`confirmCredential`): the reply that carried the newest may never have arrived.
      current = { ...record, expiresAtMs: holder.expiresAtMs, lastUsedAtMs: nowMs, updatedAtMs: nowMs, ...(holder.label ? { label: holder.label } : {}) };
    } else {
      // A first presentation, or a record this verified credential cannot open: nothing it held can be read, and nobody has proved anything for the new key pair.
      current = this.newRecord(holder, credential, record, { locked: true });
    }
    this.records.set(current.id, current);
    try {
      this.hold(holder, current, opened);
    } finally {
      opened?.privateKeyDer.fill(0);
    }
    await this.persist(current.id);
    this.heldKeys.notifyChanged(holder.userId);
    return { unlockedKeyCount: this.heldKeys.session(heldAs)?.decryptionKeys.size ?? 0 };
  }

  /** A signed-in panel session spoke: its cookie, which only the browser holds, brings its unlock back after a restart. */
  presentPanelSession(input: { sessionId: string; userId: string; expiresAtMs: number }): Promise<{ unlockedKeyCount: number }> {
    return this.presentCredential(panelSessionHolder(input), input.sessionId);
  }

  /** Stores a panel session's unlock at its sign-in, whose keys its session already holds, so they can come back. */
  async enrolPanelSession(input: { sessionId: string; userId: string; expiresAtMs: number }): Promise<void> {
    const holder = panelSessionHolder(input);
    await this.load();
    const existing = this.records.get(holder.holderId);
    const opened = existing?.userId === holder.userId ? openingGeneration(existing, input.sessionId, holder) : null;
    if (opened) {
      opened.privateKeyDer.fill(0);
      return;
    }
    const record = this.newRecord(holder, input.sessionId, undefined, { locked: false });
    this.records.set(record.id, record);
    await this.persist(record.id);
  }

  /**
   * Written ahead of a holder's new credential digest: a whole new key pair, its
   * private half under the next credential and every box re-sealed to it, beside the
   * current one. A crash either side of that digest leaves the credential Core accepts
   * able to open it, and once the new one is confirmed an old credential with an old
   * copy of this row opens nothing written since. False when there is nothing to carry
   * over, or the previous credential does not open it.
   */
  async rotateCredential(input: { holderId: string; userId: string; previousCredential: string; nextCredential: string }): Promise<boolean> {
    await this.load();
    const record = this.records.get(input.holderId);
    if (record?.userId !== input.userId) return false;
    const binding: CredentialUnlockHolderBinding = { holderId: input.holderId, userId: input.userId };
    const opened = openingGeneration(record, input.previousCredential, binding);
    if (!opened) return false;
    const pair = newCredentialUnlockKeyPair();
    try {
      const boxes: Record<string, SecretKeyCredentialUnlockBox> = {};
      for (const [recordId, box] of Object.entries(opened.boxes)) {
        const key = openCredentialUnlockBox(box, opened.privateKeyDer, { ...binding, recordId });
        if (!key) continue;
        boxes[recordId] = boxCredentialUnlockKey(key, pair.publicKey, { ...binding, recordId });
        key.fill(0);
      }
      const base = opened.generation === "pending" ? promoted(record) : record;
      this.records.set(record.id, { ...base, pending: { publicKey: pair.publicKey, wrap: wrapCredentialUnlockPrivateKey(pair.privateKeyDer, input.nextCredential, binding), boxes, credentialDigest: secretKeySessionDigest(input.nextCredential) }, updatedAtMs: this.now() });
    } finally {
      pair.privateKeyDer.fill(0);
      opened.privateKeyDer.fill(0);
    }
    await this.persist(record.id);
    return true;
  }

  /**
   * The credential with this digest is confirmed in use. When it is the generation written
   * ahead, that becomes the record, so the one it replaced opens nothing from here on. Any
   * other digest changes nothing: a generation written ahead is not this client's until its
   * own credential says so, and the next rotation replaces one that never was.
   */
  async confirmCredential(input: { holderId: string; userId: string; credentialDigest: string }): Promise<void> {
    await this.load();
    const record = this.records.get(input.holderId);
    if (record?.userId !== input.userId || record.pending?.credentialDigest !== input.credentialDigest) return;
    this.records.set(record.id, { ...promoted(record), updatedAtMs: this.now() });
    await this.persist(record.id);
  }

  /** The client went away. Its unlock leaves memory; its credential brings it back. Nothing stored changes. */
  release(holderId: string): void {
    const handle = this.heldHandleFor(holderId);
    this.connected.delete(handle);
    this.heldKeys.revokeSession(handle);
  }

  /** A holder's trust ended (forgotten, revoked): nothing is left to open, and a reconnect in flight cannot bring it back. */
  async forget(holderId: string): Promise<void> {
    this.forgotten.add(holderId);
    await this.load();
    this.release(holderId);
    await this.drop(holderId);
  }

  /** Locks a paired holder until the person's own explicit unlock: its keys leave memory and the store. A client with no row yet starts locked anyway. */
  async lock(holderId: string, reason: ModelKeyLockReason): Promise<void> {
    await this.load();
    this.heldKeys.revokeSession(this.heldHandleFor(holderId));
    const record = this.records.get(holderId);
    if (!record) return;
    const nowMs = this.now();
    const next: SecretKeyCredentialUnlockRecord = { ...record, boxes: {}, lockedAtMs: nowMs, lockReason: reason, updatedAtMs: nowMs };
    if (next.pending) next.pending = { ...next.pending, boxes: {} };
    this.records.set(holderId, next);
    // What the person was told has happened, so one the store refused is tried again on each next presentation.
    this.heldKeys.notifyChanged(record.userId);
    this.locksUnwritten.add(holderId);
    await this.persist(holderId);
    this.locksUnwritten.delete(holderId);
  }

  /** Locks a store refused, tried again. A store still refusing leaves them for the next time. */
  private async writeUnwrittenLocks(): Promise<void> {
    for (const holderId of [...this.locksUnwritten]) {
      await this.persist(holderId);
      this.locksUnwritten.delete(holderId);
    }
  }

  /**
   * Every holder of one person, and every key of theirs held in memory: a password
   * reset nobody proved the old password for, a disabled account, every session
   * revoked. Each record is attempted, so one that cannot be written does not leave the
   * rest unlocked; the failures are raised together at the end.
   */
  async lockPerson(userId: string, reason: ModelKeyLockReason): Promise<void> {
    await this.load();
    const failures: unknown[] = [];
    for (const unlock of this.heldKeys.liveUnlocksFor(userId, this.now())) this.heldKeys.revokeSession(unlock.sessionId);
    for (const record of [...this.records.values()]) {
      if (record.userId !== userId) continue;
      await attempt(failures, () => (record.holderKind === "paired-client" ? this.lock(record.holderId, reason) : this.drop(record.holderId)));
    }
    if (reason === "password_reset") await attempt(failures, () => this.notePerson(userId, { passwordResetAtMs: this.now() }));
    raiseAll(failures);
  }

  /** The one thing to say about why this person's key is locked here. `holderId` is the paired client asking, when one is. */
  lockReasonFor(input: { userId: string; holderId?: string | undefined; ownKeys: readonly SecretKeyRecord[] }): ModelKeyLockReason {
    const person = this.people.get(input.userId);
    const resetAt = person?.passwordResetAtMs;
    if (resetAt !== undefined && input.ownKeys.every((key) => key.lastRotatedAtMs <= resetAt)) return "password_reset";
    const record = input.holderId === undefined ? undefined : this.records.get(input.holderId);
    const told = person?.firstUnlockToldAtMs !== undefined;
    if (record?.userId === input.userId && record.lockedAtMs !== undefined) {
      // A reset with a key added since: what it locked stays locked, and adding one is no longer what it needs.
      if (record.lockReason === "password_reset") return "unknown";
      if (record.lockReason === "first_unlock") return told ? "unknown" : "first_unlock";
      return record.lockReason ?? "unknown";
    }
    return told ? "unknown" : "first_unlock";
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
   * explicit unlock restores it. Each record is attempted, and the failures raised
   * together at the end.
   */
  async sessionEnded(end: SecretKeySessionEnd): Promise<void> {
    await this.load();
    if (end.wholeUserId) {
      await this.lockPerson(end.wholeUserId, "sessions_ended");
      return;
    }
    const digest = end.digest;
    if (!digest) return;
    const failures: unknown[] = [];
    await attempt(failures, () => this.drop(secretKeyPanelHolderId(digest)));
    for (const record of [...this.records.values()]) {
      // Already locked says why it locked first.
      if (record.holderKind !== "paired-client" || record.lockedAtMs !== undefined) continue;
      const approvedHere = record.approvingSessionDigest === digest;
      const ownSignOut = !end.administrator && end.revokerUserId === record.userId;
      const linkEnded = record.approvingSessionDigest === undefined || (end.liveSessionDigests !== undefined && !end.liveSessionDigests.has(record.approvingSessionDigest));
      if (approvedHere || (ownSignOut && linkEnded)) await attempt(failures, () => this.lock(record.holderId, end.administrator ? "administrator" : "signed_out"));
    }
    raiseAll(failures);
  }

  /**
   * The person proved themselves for these keys. Each is boxed to their holders the
   * host vouches for, and placed in the memory of those connected. A locked holder
   * takes nothing unless the person named it (`reach.lift`), the only thing that lifts
   * a lock, so a browser that was signed out stays locked until they choose it.
   */
  async personProved(userId: string, keys: SecretKeyProvedKeys, reach: ProofReach = {}): Promise<void> {
    await this.load();
    // A password that opened nothing proved nothing, unless the caller checked it and the person has nothing it should have opened.
    if (keys.size === 0 && (reach.passwordVerified !== true || this.hasKeysItShouldOpen(userId))) return;
    const vouched = await this.vouchedHolders(userId);
    const changed: string[] = [];
    for (const record of [...this.records.values()]) {
      if (record.userId !== userId || !vouched.has(record.holderId)) continue;
      const lifted = reach.lift?.has(record.holderId) === true;
      if (record.lockedAtMs !== undefined && !lifted) continue;
      const next: SecretKeyCredentialUnlockRecord = { ...withBoxes(record, keys), updatedAtMs: this.now() };
      for (const [recordId, key] of keys) this.placeInMemory(record, recordId, key);
      delete next.lockedAtMs;
      delete next.lockReason;
      this.records.set(record.id, next);
      changed.push(record.id);
    }
    await Promise.all(changed.map((id) => this.persist(id)));
    this.heldKeys.notifyChanged(userId);
  }

  /**
   * A password the person proved has changed. Their keys now open under new seals, and
   * only the session making the change, and a browser it approved, keep them. Everything
   * else of theirs locks: a change often means they suspect someone. A Flow running
   * elsewhere waits, as any locked key does.
   */
  async passwordChanged(userId: string, keys: SecretKeyProvedKeys, actorSessionId: string | undefined): Promise<void> {
    await this.load();
    const digest = actorSessionId === undefined ? undefined : secretKeySessionDigest(actorSessionId);
    const kept = (record: SecretKeyCredentialUnlockRecord): boolean => digest !== undefined && (record.holderId === secretKeyPanelHolderId(digest) || (record.holderKind === "paired-client" && record.lockedAtMs === undefined && record.approvingSessionDigest === digest));
    const keptHandles = new Set<string>(actorSessionId === undefined ? [] : [actorSessionId]);
    const failures: unknown[] = [];
    for (const record of [...this.records.values()]) {
      if (record.userId !== userId) continue;
      if (kept(record)) {
        if (record.holderKind === "paired-client") keptHandles.add(this.heldHandleFor(record.holderId));
      } else {
        await attempt(failures, () => (record.holderKind === "paired-client" ? this.lock(record.holderId, "password_changed") : this.drop(record.holderId)));
      }
    }
    for (const unlock of this.heldKeys.liveUnlocksFor(userId, this.now())) {
      if (!keptHandles.has(unlock.sessionId)) this.heldKeys.revokeSession(unlock.sessionId);
    }
    await attempt(failures, () => this.personProved(userId, keys));
    this.heldKeys.notifyChanged(userId);
    raiseAll(failures);
  }

  /** A record's seal changed under the same value (an upgrade): each holder that had a box gets one for the new seal. Never adds a holder. */
  async resealed(recordId: string, key: Buffer): Promise<void> {
    await this.load();
    const proved = new Map([[recordId, { keyUpdatedAtMs: 0, decryptionKey: key }]]);
    const changed: string[] = [];
    for (const record of [...this.records.values()]) {
      if (!record.boxes[recordId]) continue;
      this.records.set(record.id, { ...withBoxes(record, proved), updatedAtMs: this.now() });
      changed.push(record.id);
    }
    await Promise.all(changed.map((id) => this.persist(id)));
  }

  /** The record's box goes from every holder: a deletion or a rotation. */
  async dropKey(recordId: string): Promise<void> {
    await this.load();
    const changed: string[] = [];
    for (const record of [...this.records.values()]) {
      if (!record.boxes[recordId] && !record.pending?.boxes[recordId]) continue;
      const next: SecretKeyCredentialUnlockRecord = { ...record, boxes: withoutBox(record.boxes, recordId), updatedAtMs: this.now() };
      if (record.pending) next.pending = { ...record.pending, boxes: withoutBox(record.pending.boxes, recordId) };
      this.records.set(record.id, next);
      changed.push(record.id);
    }
    await Promise.all(changed.map((id) => this.persist(id)));
  }

  /**
   * A browser nobody has unlocked yet proves it is the person's own by starting its unlock
   * from itself: only it can read this, so a browser paired by someone else with a stolen
   * cookie is never offered to the person as theirs to unlock. Undefined for any other.
   */
  unlockTicketFor(holderId: string): string | undefined {
    const record = this.records.get(holderId);
    if (record?.lockedAtMs === undefined || record.lockReason !== "first_unlock") return undefined;
    return this.unlockTickets.for(holderId);
  }

  /** Which of the holders a person named they may lift: one unlocked before, or one nobody has whose ticket came with the ask, which it uses up. */
  async liftable(userId: string, clientIds: readonly string[], ticket: string | undefined): Promise<Set<string>> {
    await this.load();
    const lifts = new Set<string>();
    for (const holderId of clientIds) {
      const record = this.records.get(holderId);
      if (record?.userId !== userId) continue;
      if (record.lockReason === "first_unlock" && !this.unlockTickets.redeem(holderId, ticket)) continue;
      lifts.add(holderId);
    }
    return lifts;
  }

  /** A person's paired clients that are locked, for them to choose among. Only ones the host vouches for. */
  async lockedClientsFor(userId: string): Promise<SecretKeyLockedClient[]> {
    await this.load();
    const vouched = await this.vouchedHolders(userId);
    return [...this.records.values()]
      .filter((record) => record.userId === userId && record.holderKind === "paired-client" && record.lockedAtMs !== undefined && vouched.has(record.holderId))
      .map((record) => ({
        holderId: record.holderId,
        label: record.label ?? "A paired client",
        ...(record.pairedAtMs === undefined ? {} : { pairedAtMs: record.pairedAtMs }),
        ...(record.lastUsedAtMs === undefined ? {} : { lastUsedAtMs: record.lastUsedAtMs }),
        ...(record.lockReason === "first_unlock" ? { neverUnlocked: true } : {})
      }));
  }

  /** Forgets who is connected, for a shutdown. */
  closeConnections(): void {
    this.connected.clear();
  }

  /** They have sealed keys, and no reset explains why a password of theirs opens none of them. */
  private hasKeysItShouldOpen(userId: string): boolean {
    return this.store.sealedFor(userId).length > 0 && this.people.get(userId)?.passwordResetAtMs === undefined;
  }

  /** The holders of this person the host stands behind, asked before any box is written. */
  private async vouchedHolders(userId: string): Promise<Set<string>> {
    const vouch = this.vouch;
    const vouched = new Set<string>();
    if (!vouch) return vouched;
    await Promise.all([...this.records.values()].filter((record) => record.userId === userId).map(async (record) => {
      if (await vouch(record)) vouched.add(record.holderId);
    }));
    return vouched;
  }

  /** Replaces the holder's unlock in memory with what its boxes open, and drops any box that no longer opens its record. */
  private hold(holder: SecretKeyCredentialHolder, record: SecretKeyCredentialUnlockRecord, opened: OpenedGeneration | null): void {
    const heldAs = this.heldAs(holder);
    this.heldKeys.revokeSession(heldAs);
    const unlock: HeldSessionUnlock = {
      sessionId: heldAs,
      userId: holder.userId,
      expiresAtMs: holder.expiresAtMs,
      credentialHolder: holder.holderKind,
      decryptionKeys: new Map(),
      expiryTimer: this.heldKeys.sessionExpiryTimer(heldAs, holder.expiresAtMs - this.now())
    };
    this.heldKeys.holdSession(unlock);
    if (holder.holderKind === "paired-client") this.connected.add(heldAs);
    if (!opened) return;
    const stale: string[] = [];
    for (const [recordId, box] of Object.entries(opened.boxes)) {
      const key = this.openBox(record, recordId, box, opened.privateKeyDer);
      if (key) unlock.decryptionKeys.set(recordId, key);
      else stale.push(recordId);
    }
    if (stale.length === 0) return;
    const next: SecretKeyCredentialUnlockRecord = { ...record, boxes: stale.reduce(withoutBox, record.boxes) };
    if (record.pending) next.pending = { ...record.pending, boxes: stale.reduce(withoutBox, record.pending.boxes) };
    this.records.set(record.id, next);
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
    if (record.holderKind !== "paired-client") return;
    const handle = this.heldHandleFor(record.holderId);
    if (!this.connected.has(handle)) return;
    let unlock = this.heldKeys.session(handle);
    if (!unlock) {
      unlock = { sessionId: handle, userId: record.userId, expiresAtMs: record.expiresAtMs, credentialHolder: record.holderKind, decryptionKeys: new Map(), expiryTimer: this.heldKeys.sessionExpiryTimer(handle, record.expiresAtMs - this.now()) };
      this.heldKeys.holdSession(unlock);
    }
    unlock.decryptionKeys.get(recordId)?.decryptionKey.fill(0);
    unlock.decryptionKeys.set(recordId, { keyUpdatedAtMs: key.keyUpdatedAtMs, decryptionKey: Buffer.from(key.decryptionKey) });
  }

  /** The id a holder's unlock is held under: a panel session's own, or a paired client's random handle. */
  private heldAs(holder: SecretKeyCredentialHolder): string {
    return holder.holderKind === "paired-client" ? this.heldHandleFor(holder.holderId) : holder.heldAs ?? holder.holderId;
  }

  /** A new key pair for `holder`, its private half wrapped under `credential`, with no boxes. A lock on the record it replaces stays. */
  private newRecord(holder: SecretKeyCredentialHolder, credential: string, previous: SecretKeyCredentialUnlockRecord | undefined, options: { locked: boolean }): SecretKeyCredentialUnlockRecord {
    const pair = newCredentialUnlockKeyPair();
    try {
      const approvingSessionDigest = holder.approvingSessionDigest ?? previous?.approvingSessionDigest;
      const label = holder.label ?? previous?.label;
      const nowMs = this.now();
      const lockReason = previous?.lockReason ?? (options.locked ? "first_unlock" : undefined);
      return {
        recordType: "secret-key-credential-unlock",
        id: holder.holderId,
        holderId: holder.holderId,
        holderKind: holder.holderKind,
        userId: holder.userId,
        expiresAtMs: holder.expiresAtMs,
        publicKey: pair.publicKey,
        wrap: wrapCredentialUnlockPrivateKey(pair.privateKeyDer, credential, { holderId: holder.holderId, userId: holder.userId }),
        boxes: {},
        ...(approvingSessionDigest ? { approvingSessionDigest } : {}),
        ...(label ? { label } : {}),
        pairedAtMs: previous?.pairedAtMs ?? nowMs,
        ...(options.locked || previous?.lockedAtMs !== undefined ? { lockedAtMs: previous?.lockedAtMs ?? nowMs } : {}),
        ...(lockReason !== undefined ? { lockReason } : {}),
        lastUsedAtMs: nowMs,
        updatedAtMs: nowMs
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

/** The generation `credential` opens, and what it opened. Whoever holds `privateKeyDer` zeroes it. */
function openingGeneration(record: SecretKeyCredentialUnlockRecord, credential: string, binding: CredentialUnlockHolderBinding): OpenedGeneration | null {
  const privateKeyDer = unwrapCredentialUnlockPrivateKey(record.wrap, credential, binding);
  if (privateKeyDer) return { generation: "current", boxes: record.boxes, privateKeyDer };
  if (!record.pending) return null;
  const pendingKey = unwrapCredentialUnlockPrivateKey(record.pending.wrap, credential, binding);
  return pendingKey ? { generation: "pending", boxes: record.pending.boxes, privateKeyDer: pendingKey } : null;
}

/** The record with its pending generation as its current one, and none pending. */
function promoted(record: SecretKeyCredentialUnlockRecord): SecretKeyCredentialUnlockRecord {
  const { pending, ...rest } = record;
  return pending ? { ...rest, publicKey: pending.publicKey, wrap: pending.wrap, boxes: pending.boxes } : rest;
}

/** The record with these keys boxed to each of its generations. */
function withBoxes(record: SecretKeyCredentialUnlockRecord, keys: SecretKeyProvedKeys): SecretKeyCredentialUnlockRecord {
  const next: SecretKeyCredentialUnlockRecord = { ...record, boxes: generationWithBoxes(record, record, keys) };
  if (record.pending) next.pending = { ...record.pending, boxes: generationWithBoxes(record, record.pending, keys) };
  return next;
}

function generationWithBoxes(record: SecretKeyCredentialUnlockRecord, generation: Pick<SecretKeyCredentialUnlockGeneration, "publicKey" | "boxes">, keys: SecretKeyProvedKeys): Record<string, SecretKeyCredentialUnlockBox> {
  const boxes = { ...generation.boxes };
  for (const [recordId, key] of keys) boxes[recordId] = boxCredentialUnlockKey(key.decryptionKey, generation.publicKey, { holderId: record.holderId, userId: record.userId, recordId });
  return boxes;
}

function withoutBox(boxes: Readonly<Record<string, SecretKeyCredentialUnlockBox>>, recordId: string): Record<string, SecretKeyCredentialUnlockBox> {
  const next = { ...boxes };
  delete next[recordId];
  return next;
}

/** Runs one step of a lock, keeping its failure for the end so the rest still run. */
async function attempt(failures: unknown[], step: () => Promise<void>): Promise<void> {
  try {
    await step();
  } catch (error) {
    failures.push(error);
  }
}

function raiseAll(failures: readonly unknown[]): void {
  if (failures.length > 0) throw new AggregateError(failures, "A stored unlock could not be locked.");
}

function isUnlockPersonRecord(value: unknown): value is SecretKeyUnlockPersonRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const record = value as Partial<SecretKeyUnlockPersonRecord>;
  return record.recordType === "secret-key-unlock-person" && typeof record.userId === "string";
}

function isWrap(value: unknown): boolean {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

/** The read guard for stored records. A row it passes still has to be vouched for before anything is boxed to it. */
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
    && isWrap(record.wrap)
    && Boolean(record.boxes) && typeof record.boxes === "object" && !Array.isArray(record.boxes);
}

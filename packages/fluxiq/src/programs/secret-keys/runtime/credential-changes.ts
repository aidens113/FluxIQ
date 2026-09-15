import { randomUUID } from "node:crypto";
import type { EncryptedSecretValueRecord, EncryptedSecretValueRecordV2, SecretKeyRecord } from "../types.ts";
import type { HeldKeys } from "./held-keys.ts";
import type { SecretKeyStore } from "./key-store.ts";
import type { SealUpgrades } from "./seal-upgrades.ts";
import type { OpenedSecretKey, SecretValueSealer } from "./value-sealer.ts";

/** A prepared or committed credential change; `resealedKeyCount` counts the keys re-sealed under the next password. */
export type SecretKeyCredentialChange = {
  changeId: string;
  resealedKeyCount: number;
};

export type SecretKeyCredentialChangeInput = {
  userId: string;
  currentPassword: string;
  nextPassword: string;
};

/** A record's verified plaintext, the key that opened it, and which of the record's seals opened. */
export type OpenedRecordSeal = OpenedSecretKey & {
  sealed: EncryptedSecretValueRecord;
};

type PreparedSeal = {
  recordId: string;
  /** The current seal the value was opened from. */
  opened: EncryptedSecretValueRecord;
  /** The value re-sealed under the next password, written beside `opened`. */
  pending: EncryptedSecretValueRecordV2;
  key: Buffer;
};

type PendingChange = {
  userId: string;
  seals: PreparedSeal[];
  expiryTimer: ReturnType<typeof setTimeout>;
};

const CREDENTIAL_CHANGE_TTL_MS = 60_000;

/**
 * The Secret Keys side of an Identity Access credential change, written ahead so
 * that no failure leaves a key sealed only under a password that no longer
 * authenticates.
 *
 * - `prepare`, before the credential write, re-seals the user's own keys under
 *   the next password and persists each as `pendingSealed` beside the current
 *   seal. A key is the user's own when its seal is not stamped for another user
 *   and it opens with the current password.
 * - `commit`, after the write, promotes each pending seal to current.
 * - `abort`, when the write fails, removes the pending seals.
 * - Whatever happened, an unlock or reveal opens the current seal or else the
 *   pending one (`openCurrentOrPending`), then `settle` promotes the pending seal
 *   if it opened, or drops it if the current seal opened and no change in this
 *   process still owns it.
 *
 * A change neither committed nor aborted within 60 seconds is forgotten: its keys
 * are zeroed and its pending seals are left for the next unlock or reveal.
 */
export class CredentialChanges {
  private readonly pending = new Map<string, PendingChange>();
  /** Pending seals written by a change this process has not yet committed, aborted, or forgotten. */
  private readonly inFlight = new WeakSet<EncryptedSecretValueRecord>();
  private readonly store: SecretKeyStore;
  private readonly sealer: SecretValueSealer;
  private readonly heldKeys: HeldKeys;
  private readonly upgrades: SealUpgrades;

  constructor(options: { store: SecretKeyStore; sealer: SecretValueSealer; heldKeys: HeldKeys; upgrades: SealUpgrades }) {
    this.store = options.store;
    this.sealer = options.sealer;
    this.heldKeys = options.heldKeys;
    this.upgrades = options.upgrades;
  }

  /** Rejects, leaving no pending seal and holding no key, when a derivation or the write fails; the caller then refuses the change. */
  async prepare(input: SecretKeyCredentialChangeInput): Promise<SecretKeyCredentialChange> {
    await this.store.load();
    if (!input.userId || !input.currentPassword || !input.nextPassword) throw new Error("Secret key credential change is invalid");
    const settled = await Promise.allSettled(this.store.sealedFor(input.userId).map((record) => this.prepareSeal(record, input)));
    const seals = settled.flatMap((result) => (result.status === "fulfilled" && result.value ? [result.value] : []));
    const failure = settled.find((result): result is PromiseRejectedResult => result.status === "rejected");
    if (failure) {
      for (const seal of seals) seal.key.fill(0);
      throw failure.reason;
    }
    const written = this.placePending(seals);
    try {
      await Promise.all(written.map((seal) => this.store.persist(seal.recordId)));
    } catch (error) {
      await this.removePending(written);
      throw error;
    }
    const changeId = `secret-credential-change:${randomUUID()}`;
    const expiryTimer = setTimeout(() => this.forget(changeId), CREDENTIAL_CHANGE_TTL_MS);
    expiryTimer.unref?.();
    this.pending.set(changeId, { userId: input.userId, seals: written, expiryTimer });
    return { changeId, resealedKeyCount: written.length };
  }

  /**
   * Promotes a prepared change's pending seals once the credential is written.
   * A key rotated or deleted since it was prepared keeps its newer state; an
   * upgrade in between does not stop the change. The user's sessions keep their
   * keys, replaced; every other holder of those keys is revoked. If the write
   * fails, the stored pending seals still open with the new password.
   */
  async commit(changeId: string): Promise<SecretKeyCredentialChange> {
    const change = this.take(changeId);
    if (!change) throw new Error("Secret key credential change is unavailable");
    const committed: string[] = [];
    const writes: string[] = [];
    for (const { recordId, opened, pending, key } of change.seals) {
      const current = this.store.get(recordId);
      if (current?.sealed === pending) {
        // Already promoted by an unlock or reveal with the new password.
        this.heldKeys.replaceKey(recordId, key, change.userId);
        committed.push(recordId);
      } else if (current?.pendingSealed === pending && this.upgrades.descendsFrom(current.sealed, opened)) {
        this.store.set({ ...current, sealed: pending, pendingSealed: undefined });
        this.heldKeys.replaceKey(recordId, key, change.userId);
        committed.push(recordId);
        writes.push(recordId);
      }
      key.fill(0);
    }
    await Promise.all(writes.map((recordId) => this.store.persist(recordId)));
    return { changeId, resealedKeyCount: committed.length };
  }

  /** Removes a prepared change's pending seals and zeroes its keys. Unknown or already settled ids are ignored. */
  abort(changeId: string): void {
    const change = this.take(changeId);
    if (change) void this.removePending(change.seals);
  }

  /** Forgets every change without touching its pending seals, for shutdown. */
  forgetAll(): void {
    for (const changeId of [...this.pending.keys()]) this.forget(changeId);
  }

  /** Opens a record with a password: its current seal, or else its pending seal. The result names the seal that opened. */
  async openCurrentOrPending(record: SecretKeyRecord, password: string): Promise<OpenedRecordSeal | null> {
    const current = await this.sealer.openRecord(record, password);
    if (current) return { secret: current.secret, key: current.key, sealed: record.sealed };
    const pending = record.pendingSealed;
    if (!pending) return null;
    const opened = await this.sealer.openRecord(record, password, pending);
    return opened ? { secret: opened.secret, key: opened.key, sealed: pending } : null;
  }

  /**
   * Settles a record's pending seal after `opened`, one of its seals, opened
   * with a password. `record` must be the store's current record. If the pending
   * seal opened, its credential change was written but not committed: it is
   * promoted to current, and every holder of the old key is revoked. If the
   * current seal opened and no change in this process owns the pending seal, that
   * change never took effect and the pending seal is dropped. Resolves once the
   * record is written.
   */
  settle(record: SecretKeyRecord, opened: EncryptedSecretValueRecord): Promise<void> {
    const pending = record.pendingSealed;
    if (!pending) return Promise.resolve();
    if (opened === pending) {
      this.store.set({ ...record, sealed: pending, pendingSealed: undefined });
      this.heldKeys.revokeKey(record.id);
    } else if (!this.inFlight.has(pending)) {
      this.store.set({ ...record, pendingSealed: undefined });
    } else {
      return Promise.resolve();
    }
    return this.store.persist(record.id);
  }

  private async prepareSeal(record: SecretKeyRecord, input: SecretKeyCredentialChangeInput): Promise<PreparedSeal | null> {
    const opened = await this.sealer.openRecord(record, input.currentPassword);
    if (!opened) return null;
    opened.key.fill(0);
    try {
      const next = await this.sealer.seal(opened.secret, input.nextPassword, input.userId);
      return { recordId: record.id, opened: record.sealed, pending: next.sealed, key: next.key };
    } finally {
      opened.secret.value = "";
    }
  }

  /** Places each prepared seal beside its record's current seal in memory, skipping a record rotated or deleted since it was opened. */
  private placePending(seals: PreparedSeal[]): PreparedSeal[] {
    const placed: PreparedSeal[] = [];
    for (const seal of seals) {
      const current = this.store.get(seal.recordId);
      if (!current || !this.upgrades.descendsFrom(current.sealed, seal.opened)) {
        seal.key.fill(0);
        continue;
      }
      this.store.set({ ...current, pendingSealed: seal.pending });
      this.inFlight.add(seal.pending);
      placed.push(seal);
    }
    return placed;
  }

  /**
   * Removes each seal's pending seal where it is still pending, zeroes its key,
   * and writes the records. A removal that fails to write leaves a pending seal
   * that the next unlock or reveal with the current password drops.
   */
  private async removePending(seals: PreparedSeal[]): Promise<void> {
    const changed: string[] = [];
    for (const seal of seals) {
      this.inFlight.delete(seal.pending);
      seal.key.fill(0);
      const current = this.store.get(seal.recordId);
      if (current?.pendingSealed !== seal.pending) continue;
      this.store.set({ ...current, pendingSealed: undefined });
      changed.push(seal.recordId);
    }
    await Promise.allSettled(changed.map((recordId) => this.store.persist(recordId)));
  }

  /** Drops a change from memory and zeroes its keys, leaving its pending seals for the next unlock or reveal to settle. */
  private forget(changeId: string): void {
    for (const { key } of this.take(changeId)?.seals ?? []) key.fill(0);
  }

  private take(changeId: string): PendingChange | undefined {
    const change = this.pending.get(changeId);
    if (!change) return undefined;
    clearTimeout(change.expiryTimer);
    this.pending.delete(changeId);
    for (const seal of change.seals) this.inFlight.delete(seal.pending);
    return change;
  }
}

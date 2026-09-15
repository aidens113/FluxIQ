import type { EncryptedSecretValueRecord } from "../types.ts";
import type { HeldKeys } from "./held-keys.ts";
import type { SecretKeyStore } from "./key-store.ts";
import type { SecretKeyValue, SecretValueSealer } from "./value-sealer.ts";

/**
 * Upgrades a verified older seal (version 1, or version 2 below the write cost)
 * to version 2 at the write parameters, with no user step. The value,
 * `updatedAtMs`, and `lastRotatedAtMs` are kept. The upgrade commits only over
 * the exact seal that was opened, so a rotation or deletion that won the race
 * stands, and every held key for the record is replaced. Concurrent callers for
 * one seal share one upgrade.
 */
export class SealUpgrades {
  private readonly inflight = new Map<string, { opened: EncryptedSecretValueRecord; done: Promise<void> }>();
  /** Each upgraded seal's predecessor, so a credential change prepared before an upgrade still applies after it. */
  private readonly predecessors = new WeakMap<EncryptedSecretValueRecord, EncryptedSecretValueRecord>();
  private readonly store: SecretKeyStore;
  private readonly sealer: SecretValueSealer;
  private readonly heldKeys: HeldKeys;

  constructor(options: { store: SecretKeyStore; sealer: SecretValueSealer; heldKeys: HeldKeys }) {
    this.store = options.store;
    this.sealer = options.sealer;
    this.heldKeys = options.heldKeys;
  }

  /**
   * Upgrades `opened`, a seal a password has just verified, if it needs it.
   * Never rejects: a failed upgrade leaves the verified seal in place, and the
   * next successful unlock or reveal retries it. The seal is stamped for the
   * user whose password opened it, when known.
   */
  upgrade(recordId: string, opened: EncryptedSecretValueRecord, secret: SecretKeyValue, password: string, provenUserId: string | undefined): Promise<void> {
    if (!this.sealer.needsReseal(opened)) return Promise.resolve();
    const inflight = this.inflight.get(recordId);
    if (inflight?.opened === opened) return inflight.done;
    const done: Promise<void> = this.reseal(recordId, opened, secret, password, provenUserId)
      .catch(() => undefined)
      .finally(() => {
        if (this.inflight.get(recordId)?.done === done) this.inflight.delete(recordId);
      });
    this.inflight.set(recordId, { opened, done });
    return done;
  }

  /** True when `sealed` is `ancestor` or an upgrade of it. An upgrade keeps the value and the password. */
  descendsFrom(sealed: EncryptedSecretValueRecord, ancestor: EncryptedSecretValueRecord): boolean {
    for (let candidate: EncryptedSecretValueRecord | undefined = sealed; candidate; candidate = this.predecessors.get(candidate)) {
      if (candidate === ancestor) return true;
    }
    return false;
  }

  private async reseal(recordId: string, opened: EncryptedSecretValueRecord, secret: SecretKeyValue, password: string, provenUserId: string | undefined): Promise<void> {
    const stamp = provenUserId ?? (opened.version === 2 ? opened.sealedByUserId : undefined) ?? this.store.get(recordId)?.createdBy;
    const next = await this.sealer.seal(secret, password, stamp);
    const current = this.store.get(recordId);
    if (current?.sealed !== opened) {
      next.key.fill(0);
      return;
    }
    this.store.set({ ...current, sealed: next.sealed });
    this.predecessors.set(next.sealed, opened);
    this.heldKeys.replaceKey(recordId, next.key);
    next.key.fill(0);
    await this.store.persist(recordId);
  }
}

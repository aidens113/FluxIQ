import { timingSafeEqual } from "node:crypto";
import { SecretKeyProtectionUnavailableError, type SecretKeyHostProtection } from "../../../../platform/custody/protection/index.ts";
import type { SecretKeyRecord } from "../../types.ts";
import type { SecretValueSealer } from "../value-sealer.ts";
import { secretKeySealDigest } from "./seal-digest.ts";
import { SecretKeyAccessUnavailableError } from "./unavailable-error.ts";

/** Protects existing data keys without changing the encrypted provider values. */
export class SecretKeyDataKeys {
  constructor(private readonly options: { hostProtection?: SecretKeyHostProtection | undefined; storeId?: string | undefined; sealer: SecretValueSealer }) {
    if (options.hostProtection && !options.storeId) throw new TypeError("Host secret protection requires an immutable store identity.");
  }

  /** Whether this server was given host protection at all; a configured one can still be unavailable when it seals. */
  get configured(): boolean {
    return this.options.hostProtection !== undefined;
  }

  /**
   * Wraps a host-sealed (version 3) value's data key for its owner. It is the
   * value's only way in, so it is never skipped: no host protection, or a
   * record that names another owner or none, is refused before anything is
   * written, and an unavailable protection key rejects with
   * `host_protection_unavailable`.
   */
  async protectHostSealed(record: SecretKeyRecord, key: Buffer, ownerUserId: string): Promise<SecretKeyRecord> {
    if (!this.options.hostProtection) throw new SecretKeyAccessUnavailableError("host_protection_unavailable");
    if (record.sealed.version !== 3 || !ownerUserId || record.createdBy !== ownerUserId) throw new TypeError("A host-sealed key is protected only for the owner it names.");
    const protectedRecord = await this.protect(record, key, ownerUserId);
    if (!protectedRecord.hostProtection) throw new SecretKeyAccessUnavailableError("host_protection_unavailable");
    return protectedRecord;
  }

  async protect(record: SecretKeyRecord, key: Buffer, ownerUserId: string | undefined): Promise<SecretKeyRecord> {
    if (!this.options.hostProtection || !ownerUserId || record.createdBy !== ownerUserId) return record;
    const secret = this.options.sealer.openRecordWithKey(record, key);
    if (!secret) throw new SecretKeyAccessUnavailableError("ciphertext_invalid");
    secret.value = "";
    const sealDigest = secretKeySealDigest(record.sealed);
    if (record.hostProtection?.ownerUserId === ownerUserId && record.hostProtection.sealDigest === sealDigest) {
      let previous: Buffer | undefined;
      try {
        previous = await this.open(record, ownerUserId);
        if (previous.byteLength === key.byteLength && timingSafeEqual(previous, key)) return record;
      } catch (error) {
        if (!(error instanceof SecretKeyAccessUnavailableError)) throw error;
        // Legitimate material already authenticated the value above; an unreadable old wrap can be replaced.
      } finally {
        previous?.fill(0);
      }
    }
    try {
      const sealed = await this.options.hostProtection.seal({ context: { storeId: this.options.storeId!, ownerUserId, recordId: record.id, sealDigest }, dataKey: key });
      return { ...record, hostProtection: { ownerUserId, sealDigest, sealed } };
    } catch (error) {
      if (error instanceof SecretKeyProtectionUnavailableError) throw new SecretKeyAccessUnavailableError("host_protection_unavailable");
      throw error;
    }
  }

  async open(record: SecretKeyRecord, ownerUserId: string): Promise<Buffer> {
    const protection = record.hostProtection;
    if (protection === undefined) throw new SecretKeyAccessUnavailableError("legacy_recovery_required");
    if (!this.options.hostProtection) throw new SecretKeyAccessUnavailableError("host_protection_unavailable");
    try {
      if (!protection || typeof protection !== "object" || Array.isArray(protection)) throw new Error("Invalid protection.");
      if (protection.ownerUserId !== ownerUserId || record.createdBy !== ownerUserId || protection.sealDigest !== secretKeySealDigest(record.sealed)) throw new Error("Context changed.");
      const key = await this.options.hostProtection.open({ context: { storeId: this.options.storeId!, ownerUserId, recordId: record.id, sealDigest: protection.sealDigest }, sealed: protection.sealed });
      const secret = this.options.sealer.openRecordWithKey(record, key);
      if (!secret) {
        key.fill(0);
        throw new Error("Value changed.");
      }
      secret.value = "";
      return key;
    } catch (error) {
      if (error instanceof SecretKeyProtectionUnavailableError) throw new SecretKeyAccessUnavailableError("host_protection_unavailable");
      throw new SecretKeyAccessUnavailableError("ciphertext_invalid");
    }
  }
}

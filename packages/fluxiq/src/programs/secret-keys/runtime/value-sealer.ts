import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import {
  LEGACY_V1_SCRYPT_PARAMETERS,
  createKdfSalt,
  decodeKdfSalt,
  deriveScryptKey,
  isAcceptedV2ScryptParameters,
  isBelowScryptWriteCost,
  scryptWriteParameters,
  type DeriveScryptKeyFn,
  type PasswordKdfOptions,
  type ScryptDerivationOptions,
  type ScryptParameters
} from "../../_shared/password-kdf/index.ts";
import type { EncryptedSecretValueRecord, EncryptedSecretValueRecordV2, SecretKeyRecord } from "../types.ts";

/** A sealed plaintext. `updatedAtMs` is the key's `lastRotatedAtMs` when its value was set. */
export type SecretKeyValue = {
  id: string;
  value: string;
  updatedAtMs: number;
};

/** A new seal and the key it was sealed with. Whoever holds `key` zeroes it. */
export type SealedSecretValue = {
  sealed: EncryptedSecretValueRecordV2;
  key: Buffer;
};

/** A record's verified plaintext and the key that opened it. Whoever holds `key` zeroes it. */
export type OpenedSecretKey = {
  secret: SecretKeyValue;
  key: Buffer;
};

const GCM_IV_BYTES = 12;
const GCM_TAG_BYTES = 16;

/**
 * Seals and opens Secret Keys values: AES-256-GCM under a password-derived
 * scrypt key. Every derivation runs through `deriveScryptKey` (or a test's
 * injected derive), and a seal's parameters are checked against the read
 * allowlist before any derivation starts.
 */
export class SecretValueSealer {
  readonly writeParameters: ScryptParameters;
  private readonly derive: DeriveScryptKeyFn;
  private readonly derivationOptions: ScryptDerivationOptions;

  constructor(options: PasswordKdfOptions = {}) {
    this.writeParameters = scryptWriteParameters(options.testOnlyWeakParameters);
    this.derive = options.derive ?? deriveScryptKey;
    this.derivationOptions = { testOnlyWeakParameters: options.testOnlyWeakParameters };
  }

  /** The parameters a seal derives at, or null when a version 2 seal states parameters outside the read allowlist. */
  parametersOf(sealed: EncryptedSecretValueRecord): ScryptParameters | null {
    if (sealed.version === 1) return LEGACY_V1_SCRYPT_PARAMETERS;
    return isAcceptedV2ScryptParameters(sealed.kdfParams, this.derivationOptions.testOnlyWeakParameters) ? sealed.kdfParams : null;
  }

  /**
   * True for a version 1 seal, or a version 2 seal below the write cost. A seal
   * at or above the write cost is never rewritten, so rolling back to a build
   * with a lower cost cannot downgrade it.
   */
  needsReseal(sealed: EncryptedSecretValueRecord): boolean {
    return sealed.version === 1 || isBelowScryptWriteCost(sealed.kdfParams, this.writeParameters);
  }

  /** Derives the key a password gives for a seal: version 1 from the salt text, version 2 from the decoded salt bytes. */
  async deriveKey(sealed: EncryptedSecretValueRecord, password: string): Promise<Buffer> {
    const parameters = this.parametersOf(sealed);
    if (!parameters) throw new Error("Secret key seal parameters are not accepted");
    const salt = sealed.version === 1 ? sealed.salt : decodeKdfSalt(sealed.salt);
    if (salt === null) throw new Error("Secret key seal salt is invalid");
    return this.derive(password, salt, parameters, this.derivationOptions);
  }

  /** Seals a value as version 2 at the write parameters under a new salt and IV. */
  async seal(secret: SecretKeyValue, password: string, sealedByUserId?: string): Promise<SealedSecretValue> {
    const plaintext = JSON.stringify({ id: secret.id, value: secret.value, updatedAtMs: secret.updatedAtMs });
    const parameters = this.writeParameters;
    const salt = createKdfSalt();
    const key = await this.derive(password, salt, parameters, this.derivationOptions);
    try {
      const iv = randomBytes(GCM_IV_BYTES);
      const cipher = createCipheriv("aes-256-gcm", key, iv, { authTagLength: GCM_TAG_BYTES });
      const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
      return {
        sealed: {
          version: 2,
          algorithm: "aes-256-gcm",
          kdf: "scrypt",
          kdfParams: { N: parameters.N, r: parameters.r, p: parameters.p, keyLength: parameters.keyLength },
          ...(sealedByUserId ? { sealedByUserId } : {}),
          salt: salt.toString("base64url"),
          iv: iv.toString("base64url"),
          tag: cipher.getAuthTag().toString("base64url"),
          ciphertext: ciphertext.toString("base64url")
        },
        key
      };
    } catch (error) {
      key.fill(0);
      throw error;
    }
  }

  /** Opens a seal with a derived key. Null when authentication fails or the plaintext is not a secret key payload. */
  open(sealed: EncryptedSecretValueRecord, key: Buffer): SecretKeyValue | null {
    try {
      const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(sealed.iv, "base64url"), { authTagLength: GCM_TAG_BYTES });
      decipher.setAuthTag(Buffer.from(sealed.tag, "base64url"));
      const plaintext = Buffer.concat([decipher.update(Buffer.from(sealed.ciphertext, "base64url")), decipher.final()]);
      const parsed = JSON.parse(plaintext.toString("utf8")) as unknown;
      plaintext.fill(0);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
      const candidate = parsed as Record<string, unknown>;
      if (typeof candidate.id !== "string" || typeof candidate.value !== "string" || typeof candidate.updatedAtMs !== "number") return null;
      return { id: candidate.id, value: candidate.value, updatedAtMs: candidate.updatedAtMs };
    } catch {
      return null;
    }
  }

  /**
   * Opens one of a record's seals, its current seal unless another is given,
   * with a held key. Null unless the seal authenticates and its payload names
   * this record at its current rotation.
   */
  openRecordWithKey(record: SecretKeyRecord, key: Buffer, sealed: EncryptedSecretValueRecord = record.sealed): SecretKeyValue | null {
    const secret = this.open(sealed, key);
    if (secret && openedPayloadMatches(record, secret)) return secret;
    if (secret) secret.value = "";
    return null;
  }

  /**
   * Derives a record's key from a password and opens one of its seals, its
   * current seal unless another is given. Null, with the key zeroed, unless the
   * seal authenticates and names this record at its current rotation. Rejects
   * when the seal's parameters or salt are not accepted or the derivation fails.
   */
  async openRecord(record: SecretKeyRecord, password: string, sealed: EncryptedSecretValueRecord = record.sealed): Promise<OpenedSecretKey | null> {
    const key = await this.deriveKey(sealed, password);
    const secret = this.openRecordWithKey(record, key, sealed);
    if (secret) return { secret, key };
    key.fill(0);
    return null;
  }
}

/** A seal's payload names its record and the rotation that set its value. Metadata edits change `updatedAtMs` but not the sealed value. */
function openedPayloadMatches(record: SecretKeyRecord, secret: SecretKeyValue): boolean {
  return secret.id === record.id && secret.updatedAtMs === record.lastRotatedAtMs;
}

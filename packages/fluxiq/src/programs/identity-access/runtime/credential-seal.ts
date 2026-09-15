// Custody of password-derived credential keys: the sealed credential envelope
// (version 1 read, version 2 written), its key derivation, and the dummy
// derivation that keeps failed lookups as costly as a real check.

import { createCipheriv, createDecipheriv, randomBytes, type BinaryLike } from "node:crypto";
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
  type ScryptParameters
} from "../../_shared/password-kdf/index.ts";
import type { UserCredential } from "../types.ts";

type SealedCredentialFields = {
  algorithm: "aes-256-gcm";
  kdf: "scrypt";
  salt: string;
  iv: string;
  tag: string;
  ciphertext: string;
};

/** Sealed by older builds: scrypt at N=2^14 over the salt text. Read only. */
export type SealedCredentialRecordV1 = SealedCredentialFields & { version: 1 };

/** Written by this build: scrypt at `kdfParams` over the decoded salt bytes. */
export type SealedCredentialRecordV2 = SealedCredentialFields & { version: 2; kdfParams: ScryptParameters };

export type SealedCredentialRecord = SealedCredentialRecordV1 | SealedCredentialRecordV2;

/** A credential key held in memory. Only version 2 keys are held, so every write is version 2. */
export type CredentialKey = {
  readonly salt: string;
  readonly kdfParams: ScryptParameters;
  readonly key: Buffer;
};

/** A service's derivation settings, fixed at construction. */
export type CredentialKdf = {
  readonly derive: DeriveScryptKeyFn;
  readonly testOnlyWeakParameters: ScryptParameters | undefined;
  readonly writeParameters: ScryptParameters;
};

export type OpenedCredential = {
  readonly credential: UserCredential;
  /** The record's own key, kept only for a version 2 record; a version 1 key is zeroed. */
  readonly key: CredentialKey | null;
};

/**
 * Fixes a service's derivation settings. `scryptWriteParameters` is the floor
 * check: test-only weak parameters that are not valid scrypt parameters below
 * the current cost throw here, at construction, rather than at first use.
 */
export function createCredentialKdf(options: PasswordKdfOptions = {}): CredentialKdf {
  return Object.freeze({
    derive: options.derive ?? deriveScryptKey,
    testOnlyWeakParameters: options.testOnlyWeakParameters,
    writeParameters: scryptWriteParameters(options.testOnlyWeakParameters)
  });
}

/** Derives a new-salt version 2 key at the write parameters. */
export async function createCredentialKey(password: string, kdf: CredentialKdf): Promise<CredentialKey> {
  const salt = createKdfSalt();
  const key = await kdf.derive(password, salt, kdf.writeParameters, { testOnlyWeakParameters: kdf.testOnlyWeakParameters });
  return { salt: salt.toString("base64url"), kdfParams: kdf.writeParameters, key };
}

/**
 * One derivation at the write parameters whose result is discarded, run for an
 * unknown, disabled, or password-less account so that a failed lookup costs
 * what a real check costs. It goes through the same derive, and so the same
 * process-wide limiter, as a real check.
 */
export async function runDummyCredentialDerivation(password: string, kdf: CredentialKdf): Promise<void> {
  try {
    const key = await kdf.derive(password, createKdfSalt(), kdf.writeParameters, { testOnlyWeakParameters: kdf.testOnlyWeakParameters });
    key.fill(0);
  } catch {
    // The attempt fails regardless; a derivation error must not reveal more than a wrong password does.
  }
}

/** Seals a credential as version 2 under a held key, with a fresh IV. */
export function sealCredential(credential: UserCredential, credentialKey: CredentialKey): SealedCredentialRecordV2 {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", credentialKey.key, iv);
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(credential), "utf8"), cipher.final()]);
  const parameters = credentialKey.kdfParams;
  return {
    version: 2,
    algorithm: "aes-256-gcm",
    kdf: "scrypt",
    kdfParams: { N: parameters.N, r: parameters.r, p: parameters.p, keyLength: parameters.keyLength },
    salt: credentialKey.salt,
    iv: iv.toString("base64url"),
    tag: cipher.getAuthTag().toString("base64url"),
    ciphertext: ciphertext.toString("base64url")
  };
}

/**
 * Opens a sealed credential with a password. A successful GCM decrypt proves
 * the password, so no inner hash is checked. A version 2 record derives from
 * its decoded salt bytes at its recorded parameters, which must be in the
 * allowlist before anything is derived; a version 1 record derives from its
 * salt text at the legacy parameters. Throws on any failure, with the derived
 * key zeroed.
 */
export async function openSealedCredential(sealed: SealedCredentialRecord, password: string, kdf: CredentialKdf): Promise<OpenedCredential> {
  let salt: BinaryLike = sealed.salt;
  let parameters = LEGACY_V1_SCRYPT_PARAMETERS;
  if (sealed.version === 2) {
    const decoded = decodeKdfSalt(sealed.salt);
    if (!decoded || !isAcceptedV2ScryptParameters(sealed.kdfParams, kdf.testOnlyWeakParameters)) {
      throw new Error("Sealed credential parameters are not accepted");
    }
    salt = decoded;
    parameters = sealed.kdfParams;
  }
  const key = await kdf.derive(password, salt, parameters, { testOnlyWeakParameters: kdf.testOnlyWeakParameters });
  try {
    const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(sealed.iv, "base64url"), { authTagLength: 16 });
    decipher.setAuthTag(Buffer.from(sealed.tag, "base64url"));
    const plaintext = Buffer.concat([decipher.update(Buffer.from(sealed.ciphertext, "base64url")), decipher.final()]).toString("utf8");
    const parsed = JSON.parse(plaintext) as unknown;
    if (!isObject(parsed) || typeof parsed.userId !== "string" || typeof parsed.updatedAtMs !== "number") {
      throw new Error("Invalid encrypted credential payload");
    }
    const credential = parsed as unknown as UserCredential;
    if (sealed.version === 1) {
      key.fill(0);
      return { credential, key: null };
    }
    return { credential, key: { salt: sealed.salt, kdfParams: parameters, key } };
  } catch (error) {
    key.fill(0);
    throw error;
  }
}

/**
 * True for a version 1 record, or a version 2 record below the write cost. A
 * record at an equal or stronger cost is never rewritten, so rolling back to a
 * lower write cost cannot downgrade it.
 */
export function needsCredentialReseal(sealed: SealedCredentialRecord, kdf: CredentialKdf): boolean {
  return sealed.version === 1 || isBelowScryptWriteCost(sealed.kdfParams, kdf.writeParameters);
}

/**
 * Shape guard for a stored envelope. It ties `version` to the presence of
 * `kdfParams`; whether version 2 parameters are accepted is decided when the
 * record is opened, so a tampered record stays present and fails closed.
 */
export function isSealedCredentialRecord(value: unknown): value is SealedCredentialRecord {
  if (!isObject(value)) return false;
  const fields = value.algorithm === "aes-256-gcm"
    && value.kdf === "scrypt"
    && typeof value.salt === "string"
    && typeof value.iv === "string"
    && typeof value.tag === "string"
    && typeof value.ciphertext === "string";
  if (!fields) return false;
  if (value.version === 1) return !("kdfParams" in value);
  return value.version === 2 && isObject(value.kdfParams);
}

/** True when two envelopes are the same seal: same salt, IV, tag, and ciphertext. */
export function isSameSealedCredential(left: SealedCredentialRecord | undefined, right: SealedCredentialRecord): boolean {
  return Boolean(left)
    && left?.version === right.version
    && left.salt === right.salt
    && left.iv === right.iv
    && left.tag === right.tag
    && left.ciphertext === right.ciphertext;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

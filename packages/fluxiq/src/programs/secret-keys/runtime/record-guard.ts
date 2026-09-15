import type { JsonObject } from "../../../core/index.ts";
import { decodeKdfSalt } from "../../_shared/password-kdf/index.ts";
import type { EncryptedSecretValueRecord, SecretKeyRecord } from "../types.ts";
import type { SecretValueSealer } from "./value-sealer.ts";

/**
 * The read guard for stored Secret Keys records. A seal's `version` must match
 * its fields: version 1 carries no `kdfParams` or `sealedByUserId`; version 2
 * carries `kdfParams` and a salt that decodes to bytes. Its parameters must be
 * in the sealer's read allowlist. A pending seal, when present, must be an
 * accepted version 2 seal. Any other record is skipped, so a tampered record
 * cannot request a derivation.
 */
export function isSecretKeyRecord(value: unknown, sealer: SecretValueSealer): value is SecretKeyRecord {
  if (!isObject(value)) return false;
  return value.recordType === "secret-key"
    && value.encrypted === true
    && typeof value.id === "string"
    && typeof value.name === "string"
    && (value.kind === "llm" || value.kind === "custom")
    && (value.scope === "global" || value.scope === "domain" || value.scope === "flow" || value.scope === "custom")
    && typeof value.enabled === "boolean"
    && typeof value.createdAtMs === "number"
    && typeof value.updatedAtMs === "number"
    && typeof value.lastRotatedAtMs === "number"
    && isAcceptedSeal(value.sealed, sealer)
    && (!("pendingSealed" in value) || isAcceptedPendingSeal(value.pendingSealed, sealer));
}

function isAcceptedSeal(value: unknown, sealer: SecretValueSealer): boolean {
  return isEncryptedSecretValueRecord(value) && sealer.parametersOf(value) !== null;
}

/** A pending seal is written by a credential change at the write parameters, so it is always version 2. */
function isAcceptedPendingSeal(value: unknown, sealer: SecretValueSealer): boolean {
  return isEncryptedSecretValueRecord(value) && value.version === 2 && sealer.parametersOf(value) !== null;
}

function isEncryptedSecretValueRecord(value: unknown): value is EncryptedSecretValueRecord {
  if (!isObject(value)) return false;
  if (value.algorithm !== "aes-256-gcm" || value.kdf !== "scrypt") return false;
  const { salt, iv, tag, ciphertext } = value;
  if (typeof salt !== "string" || typeof iv !== "string" || typeof tag !== "string" || typeof ciphertext !== "string") return false;
  if (value.version === 1) return !("kdfParams" in value) && !("sealedByUserId" in value);
  if (value.version !== 2 || !("kdfParams" in value)) return false;
  const sealedByUserId = value.sealedByUserId;
  if ("sealedByUserId" in value && (typeof sealedByUserId !== "string" || sealedByUserId.length === 0)) return false;
  return decodeKdfSalt(salt) !== null;
}

function isObject(value: unknown): value is JsonObject {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

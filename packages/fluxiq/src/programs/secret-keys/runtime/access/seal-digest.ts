import { createHash } from "node:crypto";
import type { EncryptedSecretValueRecord } from "../../types.ts";

/** Changes only when the authenticated value seal changes, not when a label is edited. */
export function secretKeySealDigest(sealed: EncryptedSecretValueRecord): string {
  const parameters = sealed.version === 2 ? [sealed.kdfParams.N, sealed.kdfParams.r, sealed.kdfParams.p, sealed.kdfParams.keyLength, sealed.sealedByUserId ?? null] : null;
  return createHash("sha256").update(JSON.stringify([sealed.version, sealed.algorithm, sealed.kdf, parameters, sealed.salt, sealed.iv, sealed.tag, sealed.ciphertext])).digest("hex");
}

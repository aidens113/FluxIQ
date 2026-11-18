import { createHash } from "node:crypto";
import type { EncryptedSecretValueRecord } from "../../types.ts";

/** Changes only when the authenticated value seal changes, not when a label is edited. Versions 1 and 2 digest exactly as before version 3 existed. */
export function secretKeySealDigest(sealed: EncryptedSecretValueRecord): string {
  if (sealed.version === 3) return createHash("sha256").update(JSON.stringify([sealed.version, sealed.algorithm, null, null, null, sealed.iv, sealed.tag, sealed.ciphertext])).digest("hex");
  const parameters = sealed.version === 2 ? [sealed.kdfParams.N, sealed.kdfParams.r, sealed.kdfParams.p, sealed.kdfParams.keyLength, sealed.sealedByUserId ?? null] : null;
  return createHash("sha256").update(JSON.stringify([sealed.version, sealed.algorithm, sealed.kdf, parameters, sealed.salt, sealed.iv, sealed.tag, sealed.ciphertext])).digest("hex");
}

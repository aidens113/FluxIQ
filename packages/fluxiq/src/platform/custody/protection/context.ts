import type { SecretKeyProtectionContext } from "./types.ts";

/** A canonical, purpose-bound encoding; no request-provided context is trusted. */
export function secretKeyProtectionContext(context: SecretKeyProtectionContext, keyId: string): Buffer {
  for (const value of [context.storeId, context.ownerUserId, context.recordId, keyId]) {
    if (typeof value !== "string" || !value || value.length > 500) throw new TypeError("Invalid secret key protection context.");
  }
  if (!/^[a-f0-9]{64}$/u.test(context.sealDigest)) throw new TypeError("Invalid secret key seal digest.");
  return Buffer.from(JSON.stringify(["fluxiq.secret-key.aes-gcm.v1", context.storeId, context.ownerUserId, context.recordId, context.sealDigest, keyId]), "utf8");
}

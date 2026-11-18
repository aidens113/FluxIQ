import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import type { SecretKeyHostProtection, SecretKeyHostProtectionKeyResolver, SecretKeyProtectedDataKey, SecretKeyProtectionContext } from "./types.ts";
import { secretKeyProtectionContext } from "./context.ts";
import { SecretKeyProtectionUnavailableError } from "./unavailable-error.ts";

const PROVIDER = "fluxiq.secret-key.aes-gcm.v1";

/** AES-GCM wrapping with a stable host-owned resolver, including retired readable ids. */
export class AesGcmSecretKeyHostProtection implements SecretKeyHostProtection {
  constructor(private readonly resolveKey: SecretKeyHostProtectionKeyResolver) {}

  async seal(input: { context: SecretKeyProtectionContext; dataKey: Uint8Array }): Promise<SecretKeyProtectedDataKey> {
    if (input.dataKey.byteLength !== 32) throw new TypeError("A secret data key must contain 32 bytes.");
    const resolved = await this.resolveKey({ storeId: input.context.storeId });
    if (!resolved) throw new SecretKeyProtectionUnavailableError();
    const key = copyKey(resolved.key);
    try {
      const iv = randomBytes(12);
      const cipher = createCipheriv("aes-256-gcm", key, iv);
      cipher.setAAD(secretKeyProtectionContext(input.context, resolved.keyId));
      const ciphertext = Buffer.concat([cipher.update(input.dataKey), cipher.final()]);
      return { version: 1, providerId: PROVIDER, keyId: resolved.keyId, ciphertext: ciphertext.toString("base64url"), iv: iv.toString("base64url"), tag: cipher.getAuthTag().toString("base64url") };
    } finally {
      key.fill(0);
    }
  }

  async open(input: { context: SecretKeyProtectionContext; sealed: SecretKeyProtectedDataKey }): Promise<Buffer> {
    const envelope = input.sealed;
    if (!envelope || envelope.version !== 1 || envelope.providerId !== PROVIDER || typeof envelope.keyId !== "string") throw new Error("Invalid secret key protection envelope.");
    const iv = encoded(envelope.iv, 12);
    const tag = encoded(envelope.tag, 16);
    const ciphertext = encoded(envelope.ciphertext, 32);
    const aad = secretKeyProtectionContext(input.context, envelope.keyId);
    const resolved = await this.resolveKey({ storeId: input.context.storeId, keyId: envelope.keyId });
    if (!resolved || resolved.keyId !== envelope.keyId) throw new SecretKeyProtectionUnavailableError();
    const key = copyKey(resolved.key);
    try {
      const decipher = createDecipheriv("aes-256-gcm", key, iv);
      decipher.setAAD(aad);
      decipher.setAuthTag(tag);
      return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    } catch {
      throw new Error("Secret key protection authentication failed.");
    } finally {
      key.fill(0);
    }
  }
}

function copyKey(value: Uint8Array): Buffer {
  if (!(value instanceof Uint8Array) || value.byteLength !== 32) throw new SecretKeyProtectionUnavailableError();
  return Buffer.from(value);
}

function encoded(value: string, length: number): Buffer {
  if (typeof value !== "string" || !/^[A-Za-z0-9_-]+$/u.test(value)) throw new Error("Invalid secret key protection envelope.");
  const bytes = Buffer.from(value, "base64url");
  if (bytes.byteLength !== length || bytes.toString("base64url") !== value) throw new Error("Invalid secret key protection envelope.");
  return bytes;
}

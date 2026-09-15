import { randomBytes } from "node:crypto";

const KDF_SALT_BYTES = 16;
const MAX_KDF_SALT_BYTES = 64;
// Unpadded base64url of 64 bytes is 86 characters.
const MAX_KDF_SALT_TEXT_LENGTH = 86;
const BASE64URL_TEXT = /^[A-Za-z0-9_-]+$/;

/**
 * A fresh 16-byte salt for a PHC hash or a version 2 seal. Store it as
 * `salt.toString("base64url")` and pass the bytes themselves to
 * `deriveScryptKey`.
 */
export function createKdfSalt(): Buffer {
  return randomBytes(KDF_SALT_BYTES);
}

/**
 * Decodes a stored base64url salt to the bytes a PHC hash or a version 2 seal
 * derives from: `deriveScryptKey(secret, decodeKdfSalt(record.salt), params)`.
 * Returns null unless the text is canonical unpadded base64url of 16 to 64
 * bytes, so a caller can fail closed. Version 1 seals and legacy
 * `scrypt:<salt>:<hash>` strings do not use this: they pass the salt text
 * itself to scrypt.
 */
export function decodeKdfSalt(text: string): Buffer | null {
  if (typeof text !== "string" || text.length > MAX_KDF_SALT_TEXT_LENGTH || !BASE64URL_TEXT.test(text)) return null;
  const bytes = Buffer.from(text, "base64url");
  if (bytes.length < KDF_SALT_BYTES || bytes.length > MAX_KDF_SALT_BYTES) return null;
  return bytes.toString("base64url") === text ? bytes : null;
}

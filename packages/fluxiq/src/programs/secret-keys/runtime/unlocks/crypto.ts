import { createCipheriv, createDecipheriv, createPrivateKey, createPublicKey, diffieHellman, generateKeyPairSync, hkdfSync, randomBytes } from "node:crypto";
import type { SecretKeyCredentialUnlockBox, SecretKeyCredentialUnlockWrap } from "../../types.ts";

/**
 * The cryptography of a credential unlock. Nothing here reads a store, a clock or
 * a logger, and nothing here puts a credential or a key in an error.
 *
 * Each holder (a paired client, a signed-in panel session) has one X25519 key
 * pair. Its public half is stored in the clear, so anything a person proves
 * themselves for can be boxed to that holder without the holder's credential
 * being present. Its private half is stored only under a key derived from the
 * credential, which Core keeps only as a digest. A credential is 122 or 256
 * random bits, never a password, so HKDF is the right derivation and scrypt would
 * add cost and no strength.
 */

const GCM_IV_BYTES = 12;
const GCM_TAG_BYTES = 16;
const KEY_BYTES = 32;
const SALT_BYTES = 16;
/** What Node's GCM says when the tag does not authenticate; it carries no code. */
const GCM_AUTHENTICATION_FAILURE = /unable to authenticate data/u;
const WRAP_INFO = "fluxiq/secret-keys/credential-unlock/wrap/v1";
const BOX_INFO = "fluxiq/secret-keys/credential-unlock/box/v1";

/** What a wrap is bound to: another holder's or another person's wrap never authenticates here. */
export type CredentialUnlockHolderBinding = { holderId: string; userId: string };

/** What a box is bound to: moved onto another holder, person or record, it does not open. */
export type CredentialUnlockBoxBinding = CredentialUnlockHolderBinding & { recordId: string };

/** A new key pair. Whoever holds `privateKeyDer` zeroes it. */
export function newCredentialUnlockKeyPair(): { publicKey: string; privateKeyDer: Buffer } {
  const { publicKey, privateKey } = generateKeyPairSync("x25519");
  return {
    publicKey: publicKey.export({ type: "spki", format: "der" }).toString("base64url"),
    privateKeyDer: privateKey.export({ type: "pkcs8", format: "der" })
  };
}

/** The private half under a key only `credential` derives, under a new salt. */
export function wrapCredentialUnlockPrivateKey(privateKeyDer: Buffer, credential: string, binding: CredentialUnlockHolderBinding): SecretKeyCredentialUnlockWrap {
  const salt = randomBytes(SALT_BYTES);
  const key = credentialWrapKey(credential, salt, binding);
  try {
    return { salt: salt.toString("base64url"), ...seal(key, privateKeyDer, wrapAad(binding)) };
  } finally {
    key.fill(0);
  }
}

/** The private half, or null when `credential` does not open this wrap. Whoever holds the result zeroes it. */
export function unwrapCredentialUnlockPrivateKey(wrap: SecretKeyCredentialUnlockWrap, credential: string, binding: CredentialUnlockHolderBinding): Buffer | null {
  const key = credentialWrapKey(credential, Buffer.from(wrap.salt, "base64url"), binding);
  try {
    return open(key, wrap, wrapAad(binding));
  } finally {
    key.fill(0);
  }
}

/** A data key, boxed so that only the private half of `publicKey` opens it. */
export function boxCredentialUnlockKey(dataKey: Buffer, publicKey: string, binding: CredentialUnlockBoxBinding): SecretKeyCredentialUnlockBox {
  const holderPublic = createPublicKey({ key: Buffer.from(publicKey, "base64url"), format: "der", type: "spki" });
  const ephemeral = generateKeyPairSync("x25519");
  const ephemeralPublic = ephemeral.publicKey.export({ type: "spki", format: "der" });
  const shared = diffieHellman({ privateKey: ephemeral.privateKey, publicKey: holderPublic });
  const key = boxKey(shared, ephemeralPublic, binding);
  shared.fill(0);
  try {
    return { ephemeralPublicKey: ephemeralPublic.toString("base64url"), ...seal(key, dataKey, boxAad(binding)) };
  } finally {
    key.fill(0);
  }
}

/** A data key from its box, or null when this private half or binding does not open it. Whoever holds the result zeroes it. */
export function openCredentialUnlockBox(box: SecretKeyCredentialUnlockBox, privateKeyDer: Buffer, binding: CredentialUnlockBoxBinding): Buffer | null {
  const ephemeralPublic = Buffer.from(box.ephemeralPublicKey, "base64url");
  const shared = diffieHellman({
    privateKey: createPrivateKey({ key: privateKeyDer, format: "der", type: "pkcs8" }),
    publicKey: createPublicKey({ key: ephemeralPublic, format: "der", type: "spki" })
  });
  const key = boxKey(shared, ephemeralPublic, binding);
  shared.fill(0);
  try {
    return open(key, box, boxAad(binding));
  } finally {
    key.fill(0);
  }
}

function credentialWrapKey(credential: string, salt: Buffer, binding: CredentialUnlockHolderBinding): Buffer {
  const ikm = Buffer.from(credential, "utf8");
  try {
    return derived(ikm, salt, `${WRAP_INFO}|${binding.holderId}|${binding.userId}`);
  } finally {
    ikm.fill(0);
  }
}

function boxKey(shared: Buffer, ephemeralPublic: Buffer, binding: CredentialUnlockBoxBinding): Buffer {
  return derived(shared, ephemeralPublic, `${BOX_INFO}|${binding.holderId}|${binding.userId}|${binding.recordId}`);
}

function derived(ikm: Buffer, salt: Buffer, info: string): Buffer {
  const output = new Uint8Array(hkdfSync("sha256", ikm, salt, info, KEY_BYTES));
  const key = Buffer.from(output);
  output.fill(0);
  return key;
}

function wrapAad(binding: CredentialUnlockHolderBinding): Buffer {
  return Buffer.from(`${WRAP_INFO}|${binding.holderId}|${binding.userId}`, "utf8");
}

function boxAad(binding: CredentialUnlockBoxBinding): Buffer {
  return Buffer.from(`${BOX_INFO}|${binding.holderId}|${binding.userId}|${binding.recordId}`, "utf8");
}

function seal(key: Buffer, plaintext: Buffer, aad: Buffer): { iv: string; tag: string; ciphertext: string } {
  const iv = randomBytes(GCM_IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", key, iv, { authTagLength: GCM_TAG_BYTES });
  cipher.setAAD(aad);
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  return { iv: iv.toString("base64url"), tag: cipher.getAuthTag().toString("base64url"), ciphertext: ciphertext.toString("base64url") };
}

function open(key: Buffer, sealed: { iv: string; tag: string; ciphertext: string }, aad: Buffer): Buffer | null {
  try {
    const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(sealed.iv, "base64url"), { authTagLength: GCM_TAG_BYTES });
    decipher.setAAD(aad);
    decipher.setAuthTag(Buffer.from(sealed.tag, "base64url"));
    return Buffer.concat([decipher.update(Buffer.from(sealed.ciphertext, "base64url")), decipher.final()]);
  } catch (error) {
    // Authentication refusing it is the one answer "this key does not open this". Anything else, a malformed field, fails closed, and no field is in the message.
    if (error instanceof Error && GCM_AUTHENTICATION_FAILURE.test(error.message)) return null;
    throw new Error("A stored credential unlock could not be read.");
  }
}

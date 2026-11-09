// Loads an Ed25519 private key from PEM text, the one-line `fxkey1.<base64url PKCS#8>`
// form, or a file. A key that was named and cannot be used is an error, never skipped.

import { createPrivateKey, createPublicKey, type KeyObject } from "node:crypto";
import { readFileSync, statSync } from "node:fs";
import { SdkError } from "../errors/index.ts";
import { fluxiqKeyId } from "./key-id.ts";
import type { LoadedKey } from "./loaded-key.ts";

const ONE_LINE_PREFIX = "fxkey1.";

function parsePrivateKey(text: string, source: string): KeyObject {
  const trimmed = text.trim();
  try {
    if (trimmed.startsWith(ONE_LINE_PREFIX)) return createPrivateKey({ key: Buffer.from(trimmed.slice(ONE_LINE_PREFIX.length), "base64url"), format: "der", type: "pkcs8" });
    return createPrivateKey(trimmed);
  } catch (error) {
    throw new SdkError("key_unreadable", `The key from ${source} is not a PKCS#8 private key (PEM, or fxkey1.<base64url>).`, { cause: error, hint: "Make one with `fluxiq init`, or `openssl genpkey -algorithm ed25519`." });
  }
}

/** Loads a key from its text. `source` names where it came from, for messages. */
export function loadPrivateKeyText(text: string, source: string): LoadedKey {
  const privateKey = parsePrivateKey(text, source);
  if (privateKey.asymmetricKeyType !== "ed25519") throw new SdkError("key_unreadable", `The key from ${source} is ${String(privateKey.asymmetricKeyType)}, not Ed25519.`, { hint: "FluxIQ keys are Ed25519." });
  const publicKeySpki = createPublicKey(privateKey).export({ format: "der", type: "spki" });
  return { privateKey, publicKeySpki, keyId: fluxiqKeyId(publicKeySpki), source };
}

/**
 * Loads a key from a file. On POSIX a file that group or others can read is refused,
 * as ssh does; Windows file permissions are set by `fluxiq init` and not checked here.
 */
export function loadPrivateKeyFile(file: string, source: string): LoadedKey {
  let text: string;
  try {
    if (process.platform !== "win32" && (statSync(file).mode & 0o077) !== 0) {
      throw new SdkError("key_insecure", `The key file ${file} (${source}) can be read by other users.`, { hint: `Run: chmod 600 "${file}"` });
    }
    text = readFileSync(file, "utf8");
  } catch (error) {
    if (error instanceof SdkError) throw error;
    throw new SdkError("key_unreadable", `The key file ${file} (${source}) could not be read: ${error instanceof Error ? error.message : "unreadable"}.`, { cause: error });
  }
  return loadPrivateKeyText(text, `${source} (${file})`);
}

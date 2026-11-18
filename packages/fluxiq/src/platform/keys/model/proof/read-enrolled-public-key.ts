import { createHash, createPublicKey, type KeyObject } from "node:crypto";
import { KeySessionError } from "../error.ts";
import { decodeKeyValue } from "./decode-key-value.ts";

/** Ed25519 has a 44-byte SPKI. Parsing and re-exporting refuse trailing bytes or alternative encodings. */
export function readEnrolledPublicKey(value: unknown): { key: KeyObject; keyId: string; publicKey: string } {
  const der = decodeKeyValue(value, 44);
  let key: KeyObject;
  try {
    key = createPublicKey({ key: der, format: "der", type: "spki" });
  } catch {
    throw new KeySessionError("key.bad_proof");
  }
  const publicKey = key.export({ format: "der", type: "spki" }).toString("base64url");
  if (key.asymmetricKeyType !== "ed25519" || publicKey !== value) throw new KeySessionError("key.bad_proof");
  return { key, keyId: `fxk_${createHash("sha256").update(der).digest("base64url").slice(0, 26)}`, publicKey };
}

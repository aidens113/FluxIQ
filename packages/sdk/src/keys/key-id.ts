// A key's id: `fxk_` and the first 26 base64url characters of SHA-256 of its SPKI DER,
// so a client knows its own id without asking and the engine can check it matches.

import { createHash } from "node:crypto";

/** The key id for a public key given as SPKI DER. */
export function fluxiqKeyId(publicKeySpki: Uint8Array): string {
  return `fxk_${createHash("sha256").update(publicKeySpki).digest("base64url").slice(0, 26)}`;
}

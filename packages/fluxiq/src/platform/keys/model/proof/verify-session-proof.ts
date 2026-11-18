import { createHash, verify } from "node:crypto";
import { KeySessionError } from "../error.ts";
import { decodeKeyValue } from "./decode-key-value.ts";
import { readEnrolledPublicKey } from "./read-enrolled-public-key.ts";
import type { SessionProof } from "./types.ts";

/** Verifies only against the stored key; a public key arriving with a proof is never enrollment. */
export function verifySessionProof(proof: SessionProof, enrolled: { keyId: string; publicKey: string }): void {
  const trusted = readEnrolledPublicKey(enrolled.publicKey);
  if (trusted.keyId !== enrolled.keyId || proof.keyId !== trusted.keyId || proof.publicKey !== trusted.publicKey) throw new KeySessionError("key.bad_signature");
  const text = [proof.alg, proof.purpose, proof.aud, proof.keyId, proof.time, proof.nonce, createHash("sha256").update(proof.payload, "utf8").digest("hex")].join("\n");
  if (!verify(null, Buffer.from(text, "utf8"), trusted.key, decodeKeyValue(proof.sig, 64))) throw new KeySessionError("key.bad_signature");
}

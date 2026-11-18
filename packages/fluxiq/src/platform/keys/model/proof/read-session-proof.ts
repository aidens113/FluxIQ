import { KeySessionError } from "../error.ts";
import { decodeKeyValue } from "./decode-key-value.ts";
import type { SessionProof } from "./types.ts";

const FIELDS = ["v", "alg", "keyId", "time", "nonce", "aud", "purpose", "payload", "sig", "publicKey"];

export function readSessionProof(input: unknown): SessionProof {
  if (typeof input !== "object" || input === null || Array.isArray(input)) throw new KeySessionError("key.bad_proof");
  const proof = input as Record<string, unknown>;
  if (Object.keys(proof).length !== FIELDS.length || FIELDS.some((field) => !Object.hasOwn(proof, field))) throw new KeySessionError("key.bad_proof");
  if (proof.v !== 1 || proof.alg !== "FLUXIQ1-ED25519" || proof.purpose !== "session" || proof.payload !== "{}") throw new KeySessionError("key.bad_proof");
  for (const field of FIELDS.filter((name) => name !== "v")) {
    if (typeof proof[field] !== "string" || /[\r\n]/u.test(proof[field] as string)) throw new KeySessionError("key.bad_proof");
  }
  if (!/^fxk_[A-Za-z0-9_-]{26}$/u.test(proof.keyId as string) || (proof.aud as string).length > 2048) throw new KeySessionError("key.bad_proof");
  decodeKeyValue(proof.nonce, 16);
  decodeKeyValue(proof.sig, 64);
  decodeKeyValue(proof.publicKey, 44);
  return proof as SessionProof;
}

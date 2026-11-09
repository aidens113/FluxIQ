// A signed proof of key possession: the request body of the session exchange
// (keys design, section 3.1). The payload stays a string, so nothing is canonicalised.

import { createHash, randomBytes, sign } from "node:crypto";
import type { LoadedKey } from "../loaded-key.ts";
import { formatProofTime, PROOF_ALGORITHM, stringToSign, type ProofPurpose } from "./string-to-sign.ts";

/** The proof as the engine receives it. */
export type SignedProof = {
  v: 1;
  alg: typeof PROOF_ALGORITHM;
  keyId: string;
  time: string;
  nonce: string;
  aud: string;
  purpose: ProofPurpose;
  payload: string;
  sig: string;
  publicKey: string;
};

export type SignProofInput = {
  key: LoadedKey;
  purpose: ProofPurpose;
  /** The configured origin, `#`, and the engine's instance id. */
  audience: string;
  /** The JSON text of the request, or "" for none. */
  payload?: string;
  now?: Date;
  nonce?: string;
};

/** Signs the string to sign for `input`: a fresh 128-bit nonce and the current time unless given. */
export function signProof(input: SignProofInput): SignedProof {
  const payload = input.payload ?? "";
  const time = formatProofTime(input.now ?? new Date());
  const nonce = input.nonce ?? randomBytes(16).toString("base64url");
  const text = stringToSign({
    purpose: input.purpose,
    audience: input.audience,
    keyId: input.key.keyId,
    time,
    nonce,
    payloadSha256Hex: createHash("sha256").update(payload, "utf8").digest("hex")
  });
  return {
    v: 1,
    alg: PROOF_ALGORITHM,
    keyId: input.key.keyId,
    time,
    nonce,
    aud: input.audience,
    purpose: input.purpose,
    payload,
    sig: sign(null, Buffer.from(text, "utf8"), input.key.privateKey).toString("base64url"),
    publicKey: input.key.publicKeySpki.toString("base64url")
  };
}

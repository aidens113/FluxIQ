// The fake engine's half of the key exchange, written out from the keys design
// (section 3.1) rather than imported from the SDK, so a test proves the SDK signs the
// string the design names and not merely a string it can read back.

import { createHash, createPublicKey, verify } from "node:crypto";

export type ProofCheck = { ok: true; keyId: string } | { ok: false; code: string; message: string; serverTime?: number };

type Body = { v?: unknown; alg?: unknown; keyId?: unknown; time?: unknown; nonce?: unknown; aud?: unknown; purpose?: unknown; payload?: unknown; sig?: unknown };

function parseTime(time: string): number {
  const match = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/u.exec(time);
  if (match === null) return Number.NaN;
  return Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]), Number(match[4]), Number(match[5]), Number(match[6]));
}

/** Checks one proof: known key, matching id, audience, skew, fresh nonce, and the signature over the design's string. */
export function verifyProof(body: Body, known: Map<string, Buffer>, audience: string, seenNonces: Set<string>, nowMs: number): ProofCheck {
  const refuse = (code: string, message: string): ProofCheck => ({ ok: false, code, message, serverTime: nowMs });
  if (body.v !== 1 || body.alg !== "FLUXIQ1-ED25519") return refuse("key.bad_proof", "Unsupported proof version or algorithm.");
  const { keyId, time, nonce, aud, purpose, payload, sig } = body;
  if (typeof keyId !== "string" || typeof time !== "string" || typeof nonce !== "string" || typeof aud !== "string" || typeof purpose !== "string" || typeof payload !== "string" || typeof sig !== "string") return refuse("key.bad_proof", "Missing proof fields.");
  const spki = known.get(keyId);
  if (spki === undefined) return refuse("key.unknown", `Unknown key ${keyId}.`);
  const derived = `fxk_${createHash("sha256").update(spki).digest("base64url").slice(0, 26)}`;
  if (derived !== keyId) return refuse("key.bad_proof", "The key id is not derived from the key.");
  if (aud !== audience) return refuse("key.bad_audience", "The proof is addressed to another engine.");
  if (Math.abs(parseTime(time) - nowMs) > 300_000) return refuse("key.clock_skew", "The proof's time is outside the window.");
  if (nonce.length < 22) return refuse("key.bad_proof", "The nonce is too short.");
  const signed = ["FLUXIQ1-ED25519", purpose, aud, keyId, time, nonce, createHash("sha256").update(payload, "utf8").digest("hex")].join("\n");
  if (!verify(null, Buffer.from(signed, "utf8"), createPublicKey({ key: spki, format: "der", type: "spki" }), Buffer.from(sig, "base64url"))) return refuse("key.bad_signature", "The signature does not match.");
  if (seenNonces.has(`${keyId}:${nonce}`)) return refuse("key.replayed", "This nonce was already used.");
  seenNonces.add(`${keyId}:${nonce}`);
  return { ok: true, keyId };
}

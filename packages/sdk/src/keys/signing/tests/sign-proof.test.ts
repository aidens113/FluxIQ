import { createHash, createPublicKey, verify } from "node:crypto";
import { describe, expect, it } from "vitest";
import { generateKeyPair } from "../../generate-key-pair.ts";
import { loadPrivateKeyText } from "../../load-private-key.ts";
import { signProof } from "../sign-proof.ts";

describe("signProof", () => {
  const key = loadPrivateKeyText(generateKeyPair().privateKeyPem, "test");
  const now = new Date(Date.UTC(2026, 10, 9, 12, 0, 0));
  const payload = JSON.stringify({ durationSeconds: 900 });

  it("signs the string the keys design names, which the public key verifies", () => {
    const proof = signProof({ key, purpose: "session", audience: "http://127.0.0.1:4780#inst_1", payload, now, nonce: "0123456789abcdefghijkl" });
    const expected = ["FLUXIQ1-ED25519", "session", "http://127.0.0.1:4780#inst_1", key.keyId, "20261109T120000Z", "0123456789abcdefghijkl", createHash("sha256").update(payload).digest("hex")].join("\n");
    const publicKey = createPublicKey({ key: Buffer.from(proof.publicKey, "base64url"), format: "der", type: "spki" });
    expect(verify(null, Buffer.from(expected), publicKey, Buffer.from(proof.sig, "base64url"))).toBe(true);
    expect(proof).toMatchObject({ v: 1, alg: "FLUXIQ1-ED25519", keyId: key.keyId, aud: "http://127.0.0.1:4780#inst_1", purpose: "session", payload });
  });

  it("hashes an absent payload as the empty string and mints a fresh 128-bit nonce each time", () => {
    const first = signProof({ key, purpose: "hello", audience: "a#b", now });
    const second = signProof({ key, purpose: "hello", audience: "a#b", now });
    expect(first.nonce).not.toBe(second.nonce);
    expect(first.nonce).toMatch(/^[A-Za-z0-9_-]{22}$/u);
    expect(first.payload).toBe("");
  });

  it("changes the signature when any signed field changes", () => {
    const base = { key, purpose: "session" as const, audience: "a#b", now, nonce: "0123456789abcdefghijkl", payload: "{}" };
    const reference = signProof(base).sig;
    expect(signProof({ ...base, audience: "a#c" }).sig).not.toBe(reference);
    expect(signProof({ ...base, payload: "{ }" }).sig).not.toBe(reference);
    expect(signProof({ ...base, now: new Date(now.getTime() + 1000) }).sig).not.toBe(reference);
  });
});

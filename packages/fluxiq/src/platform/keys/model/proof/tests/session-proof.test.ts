import { generateKeyPairSync } from "node:crypto";
import { generateKeyPair, loadPrivateKeyText, signProof } from "@fluxiq/sdk";
import { describe, expect, it } from "vitest";
import { KeySessionError } from "../../index.ts";
import { checkSessionProofTime, decodeKeyValue, readEnrolledPublicKey, readSessionProof, verifySessionProof } from "../index.ts";

const pair = generateKeyPair();
const key = loadPrivateKeyText(pair.privateKeyPem, "test-only ephemeral key");
const now = Date.parse("2026-11-14T12:00:00Z");
const proof = () => signProof({ key, purpose: "session", audience: "https://app.example.com#instance-1", payload: "{}", now: new Date(now) });

describe("SDK session proof validation", () => {
  it("accepts the unmodified SDK signed bytes and derives its exact key id", () => {
    const parsed = readSessionProof(proof());
    expect(readEnrolledPublicKey(pair.publicKeyBase64Url).keyId).toBe(pair.keyId);
    expect(() => verifySessionProof(parsed, { keyId: pair.keyId, publicKey: pair.publicKeyBase64Url })).not.toThrow();
    expect(() => checkSessionProofTime(parsed.time, now)).not.toThrow();
  });

  it.each([
    ["version", { v: 2 }],
    ["algorithm", { alg: "ed25519" }],
    ["purpose", { purpose: "rotate" }],
    ["payload", { payload: "{ }" }],
    ["key id", { keyId: "fxk_invalid" }],
    ["non-string field", { time: 20261114 }],
    ["line feed", { aud: "https://app.example.com\n#instance-1" }],
    ["carriage return", { time: "20261114T120000Z\r" }],
    ["short nonce", { nonce: "AA" }],
    ["oversized nonce", { nonce: Buffer.alloc(17).toString("base64url") }],
    ["padded nonce", { nonce: `${Buffer.alloc(16).toString("base64url")}==` }],
    ["noncanonical nonce", { nonce: "AAAAAAAAAAAAAAAAAAAAAB" }],
    ["short signature", { sig: "AA" }],
    ["invalid public key", { publicKey: "not a public key" }],
    ["extra field", { privateKey: "forbidden" }],
    ["oversized audience", { aud: "a".repeat(2049) }]
  ])("refuses %s", (_name, change) => {
    expect(() => readSessionProof({ ...proof(), ...change })).toThrow(KeySessionError);
  });

  it("requires every proof field and a JSON object", () => {
    const { publicKey: _publicKey, ...incomplete } = proof();
    for (const candidate of [null, undefined, [], "proof", incomplete]) expect(() => readSessionProof(candidate)).toThrow(KeySessionError);
  });

  it.each(["20260230T120000Z", "20261314T120000Z", "20261114T240000Z", "20261114T120060Z", "2026-11-14T12:00:00Z", "Infinity"])("rejects invalid time %s", (time) => {
    expect(() => checkSessionProofTime(time, now)).toThrowError(expect.objectContaining({ code: "key.bad_proof" }));
  });

  it("accepts exactly +/-300 seconds and reports a safe server clock outside that window", () => {
    expect(() => checkSessionProofTime("20261114T115500Z", now)).not.toThrow();
    expect(() => checkSessionProofTime("20261114T120500Z", now)).not.toThrow();
    expect(() => checkSessionProofTime("20261114T115459Z", now)).toThrowError(expect.objectContaining({ code: "key.clock_skew", serverTime: now }));
    expect(() => checkSessionProofTime("20261114T120501Z", now)).toThrowError(expect.objectContaining({ code: "key.clock_skew" }));
  });

  it("refuses another key, a forged signature, and a trusted key id mismatch", () => {
    const parsed = readSessionProof(proof());
    const other = generateKeyPair();
    const enrolled = { keyId: pair.keyId, publicKey: pair.publicKeyBase64Url };
    expect(() => verifySessionProof({ ...parsed, publicKey: other.publicKeyBase64Url }, enrolled)).toThrowError(expect.objectContaining({ code: "key.bad_signature" }));
    expect(() => verifySessionProof({ ...parsed, sig: Buffer.alloc(64).toString("base64url") }, enrolled)).toThrowError(expect.objectContaining({ code: "key.bad_signature" }));
    expect(() => verifySessionProof(parsed, { keyId: other.keyId, publicKey: enrolled.publicKey })).toThrowError(expect.objectContaining({ code: "key.bad_signature" }));
  });

  it("accepts Ed25519 SPKI only, with no appended bytes or private PEM", () => {
    const ec = generateKeyPairSync("ec", { namedCurve: "prime256v1" }).publicKey.export({ format: "der", type: "spki" }).toString("base64url");
    expect(() => readEnrolledPublicKey(ec)).toThrow(KeySessionError);
    expect(() => readEnrolledPublicKey(Buffer.alloc(44).toString("base64url"))).toThrow(KeySessionError);
    expect(() => readEnrolledPublicKey(Buffer.concat([key.publicKeySpki, Buffer.from([0])]).toString("base64url"))).toThrow(KeySessionError);
    expect(() => readEnrolledPublicKey(pair.privateKeyPem)).toThrow(KeySessionError);
    expect(() => decodeKeyValue("/".repeat(22), 16)).toThrow(KeySessionError);
  });
});

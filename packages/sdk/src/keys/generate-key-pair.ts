// Makes an Ed25519 key pair for `fluxiq init`: the private key as PKCS#8 PEM, the
// public key as SPKI PEM and base64url DER, and the key id.

import { generateKeyPairSync } from "node:crypto";
import { fluxiqKeyId } from "./key-id.ts";

export type GeneratedKeyPair = {
  privateKeyPem: string;
  publicKeyPem: string;
  publicKeyBase64Url: string;
  keyId: string;
};

/** A fresh Ed25519 key pair. */
export function generateKeyPair(): GeneratedKeyPair {
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  const spki = publicKey.export({ format: "der", type: "spki" });
  return {
    privateKeyPem: privateKey.export({ format: "pem", type: "pkcs8" }).toString(),
    publicKeyPem: publicKey.export({ format: "pem", type: "spki" }).toString(),
    publicKeyBase64Url: spki.toString("base64url"),
    keyId: fluxiqKeyId(spki)
  };
}

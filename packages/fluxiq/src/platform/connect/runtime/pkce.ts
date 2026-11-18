import { createHash, randomBytes } from "node:crypto";

/** RFC 7636 S256: the validated verifier is ASCII unreserved text. */
export function connectS256Challenge(verifier: string): string {
  return createHash("sha256").update(verifier, "ascii").digest("base64url");
}

export function connectCodeDigest(code: string): string {
  return createHash("sha256").update(code, "ascii").digest("hex");
}

export function createConnectAuthorizationCode(): string {
  return randomBytes(32).toString("base64url");
}

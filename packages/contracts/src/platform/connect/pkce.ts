/**
 * PKCE shapes (RFC 7636). A `code_verifier` is 43 to 128 unreserved
 * characters; the client makes it from 32 random bytes, base64url without
 * padding (43 characters). The S256 `code_challenge` is the base64url SHA-256
 * of the verifier, always 43 characters. Computing it is the caller's (Web
 * Crypto in a client, `node:crypto` in Core); the contract fixes the shapes.
 */
export const PKCE_CODE_VERIFIER_PATTERN = /^[A-Za-z0-9\-._~]{43,128}$/u;

/** The S256 challenge: 43 base64url characters, no padding. */
export const PKCE_S256_CHALLENGE_PATTERN = /^[A-Za-z0-9_-]{43}$/u;

/** True for a well-formed `code_verifier`. */
export function isPkceCodeVerifier(value: unknown): value is string {
  return typeof value === "string" && PKCE_CODE_VERIFIER_PATTERN.test(value);
}

/** True for a well-formed S256 `code_challenge`. */
export function isPkceS256Challenge(value: unknown): value is string {
  return typeof value === "string" && PKCE_S256_CHALLENGE_PATTERN.test(value);
}

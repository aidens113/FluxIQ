import { FLUXIQ_CONNECT_LIMITS } from "./client.ts";

/**
 * The typed code's alphabet (Flow B): upper-case letters and digits without
 * the ambiguous `0`, `1`, `I`, `L` and `O`. Core draws each character from a
 * crypto RNG.
 */
export const CONNECT_REFERENCE_CODE_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";

const CODE_PATTERN = new RegExp(`^[${CONNECT_REFERENCE_CODE_ALPHABET}]{${FLUXIQ_CONNECT_LIMITS.referenceCodeLength}}$`, "u");

/** True for a typed code in canonical form (eight alphabet characters, no separator). */
export function isConnectReferenceCode(value: unknown): value is string {
  return typeof value === "string" && CODE_PATTERN.test(value);
}

/**
 * What a person typed, in canonical form, or null when it is not a code:
 * spaces and hyphens are dropped and letters upper-cased, so `abcd-efgh`
 * reads as `ABCDEFGH`. Ambiguous characters are not corrected.
 */
export function normalizeConnectReferenceCode(input: string): string | null {
  const code = input.replace(/[\s-]/gu, "").toUpperCase();
  return isConnectReferenceCode(code) ? code : null;
}

/** A canonical code as shown to a person: two groups of four, `ABCD-EFGH`. */
export function formatConnectReferenceCode(code: string): string {
  if (!isConnectReferenceCode(code)) throw new TypeError("Not a connect reference code");
  return `${code.slice(0, 4)}-${code.slice(4)}`;
}

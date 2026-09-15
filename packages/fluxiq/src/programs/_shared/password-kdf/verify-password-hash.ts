import { timingSafeEqual } from "node:crypto";
import { deriveScryptKey } from "./derive-scrypt-key.ts";
import { parseScryptPasswordHash } from "./password-hash-format.ts";
import { isAcceptedV2ScryptParameters, isBelowScryptWriteCost, scryptWriteParameters } from "./scrypt-parameters.ts";
import type { PasswordKdfOptions } from "./types.ts";

export type PasswordHashVerification = {
  readonly ok: boolean;
  /**
   * True when the hash verified and is the legacy form or records a cost below
   * the write cost. A hash at an equal or stronger cost is never rewritten.
   */
  readonly needsRehash: boolean;
};

const REJECTED: PasswordHashVerification = Object.freeze({ ok: false, needsRehash: false });

/**
 * Verifies a password or PIN against a PHC-form hash (salt bytes decoded) or a
 * legacy `scrypt:<salt>:<hash>` (salt text, read at N=2^14). Returns
 * `{ ok: false }` for a wrong value, a malformed string, parameters outside the
 * allowlist, or any failure, and never throws. Parameters are checked before
 * any derivation.
 */
export async function verifyPasswordHash(
  password: string,
  encoded: string | undefined,
  options: PasswordKdfOptions = {}
): Promise<PasswordHashVerification> {
  try {
    if (typeof password !== "string" || typeof encoded !== "string") return REJECTED;
    const writeParameters = scryptWriteParameters(options.testOnlyWeakParameters);
    const parsed = parseScryptPasswordHash(encoded);
    if (!parsed) return REJECTED;
    // Checked here as well as inside deriveScryptKey, so an injected derive is
    // never handed parameters outside the allowlist.
    if (parsed.form === "phc" && !isAcceptedV2ScryptParameters(parsed.parameters, options.testOnlyWeakParameters)) {
      return REJECTED;
    }
    const derive = options.derive ?? deriveScryptKey;
    const actual = await derive(password, parsed.salt, parsed.parameters, { testOnlyWeakParameters: options.testOnlyWeakParameters });
    const matches = actual.length === parsed.hash.length && timingSafeEqual(actual, parsed.hash);
    actual.fill(0);
    if (!matches) return REJECTED;
    return {
      ok: true,
      needsRehash: parsed.form === "legacy" || isBelowScryptWriteCost(parsed.parameters, writeParameters)
    };
  } catch {
    return REJECTED;
  }
}

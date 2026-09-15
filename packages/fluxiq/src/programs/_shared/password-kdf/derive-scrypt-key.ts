import crypto, { type BinaryLike } from "node:crypto";
import { scryptDerivationLimiter } from "./scrypt-derivation-limiter.ts";
import { isAcceptedScryptParameters } from "./scrypt-parameters.ts";
import type { ScryptDerivationOptions, ScryptParameters } from "./types.ts";

/**
 * Derives a key with async scrypt, off the event loop, through the process-wide
 * limiter. Parameters outside the allowlist are refused before `crypto.scrypt`
 * is called. Salts are passed through unchanged: the existing seals and legacy
 * hashes use the base64url salt text itself as the scrypt salt.
 */
export function deriveScryptKey(
  secret: BinaryLike,
  salt: BinaryLike,
  parameters: ScryptParameters,
  options: ScryptDerivationOptions = {}
): Promise<Buffer> {
  if (!isAcceptedScryptParameters(parameters, options.testOnlyWeakParameters)) {
    return Promise.reject(new RangeError("scrypt parameters are outside the accepted set; refusing to derive."));
  }
  const { N, r, p, keyLength } = parameters;
  // scrypt needs 128·N·r bytes and Node refuses a maxmem of exactly that, so
  // allow twice it: 256 MiB at N=2^17, and Node's 32 MiB default at N=2^14.
  const scryptOptions = { N, r, p, maxmem: 256 * N * r };
  return scryptDerivationLimiter.run(() => new Promise<Buffer>((resolve, reject) => {
    crypto.scrypt(secret, salt, keyLength, scryptOptions, (error, key) => {
      if (error) reject(error);
      else resolve(key);
    });
  }));
}

import { deriveScryptKey } from "./derive-scrypt-key.ts";
import { createKdfSalt } from "./kdf-salt.ts";
import { formatScryptPasswordHash } from "./password-hash-format.ts";
import { scryptWriteParameters } from "./scrypt-parameters.ts";
import type { PasswordKdfOptions } from "./types.ts";

/**
 * Hashes a password or PIN as `$scrypt$ln=17,r=8,p=1$<salt>$<hash>` at the
 * current parameters, or at `testOnlyWeakParameters` when a test passes them.
 * The salt field is base64url of the 16 random bytes scrypt derived from.
 */
export async function hashPassword(password: string, options: PasswordKdfOptions = {}): Promise<string> {
  const parameters = scryptWriteParameters(options.testOnlyWeakParameters);
  const salt = createKdfSalt();
  const derive = options.derive ?? deriveScryptKey;
  const key = await derive(password, salt, parameters, { testOnlyWeakParameters: options.testOnlyWeakParameters });
  try {
    if (key.length !== parameters.keyLength) {
      throw new RangeError("scrypt returned a key of the wrong length.");
    }
    return formatScryptPasswordHash(parameters, salt, key);
  } finally {
    key.fill(0);
  }
}

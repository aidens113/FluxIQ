// Password-derived keys and password hashes for global programs: scrypt at
// recorded, allowlisted parameters, derived asynchronously through a
// process-wide limit of two concurrent derivations.
//
// Salts: a PHC hash or a version 2 seal stores `createKdfSalt()` as base64url
// and derives from the bytes, reading them back with `decodeKdfSalt(text)`. A
// version 1 seal or legacy `scrypt:` hash derives from the salt text itself.
export { deriveScryptKey } from "./derive-scrypt-key.ts";
export { hashPassword } from "./hash-password.ts";
export { createKdfSalt, decodeKdfSalt } from "./kdf-salt.ts";
export {
  ACCEPTED_V2_SCRYPT_PARAMETERS,
  CURRENT_SCRYPT_PARAMETERS,
  LEGACY_V1_SCRYPT_PARAMETERS,
  isAcceptedScryptParameters,
  isAcceptedV2ScryptParameters,
  isBelowScryptWriteCost,
  scryptWriteParameters
} from "./scrypt-parameters.ts";
export type { DeriveScryptKeyFn, PasswordKdfOptions, ScryptDerivationOptions, ScryptParameters } from "./types.ts";
export { verifyPasswordHash, type PasswordHashVerification } from "./verify-password-hash.ts";

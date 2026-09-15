import type { ScryptParameters } from "./types.ts";

const SCRYPT_BLOCK_SIZE = 8;
const SCRYPT_PARALLELISM = 1;
const SCRYPT_KEY_LENGTH = 32;
const PARAMETER_KEYS = ["N", "keyLength", "p", "r"] as const;

function scryptParametersAt(log2N: number): ScryptParameters {
  return Object.freeze({ N: 2 ** log2N, r: SCRYPT_BLOCK_SIZE, p: SCRYPT_PARALLELISM, keyLength: SCRYPT_KEY_LENGTH });
}

/** Parameters every new seal and hash is written at: scrypt N=2^17, r=8, p=1. */
export const CURRENT_SCRYPT_PARAMETERS: ScryptParameters = scryptParametersAt(17);

/**
 * Parameters of version 1 records and legacy `scrypt:<salt>:<hash>` strings,
 * which record none. This is Node's `scryptSync` default, stated explicitly.
 */
export const LEGACY_V1_SCRYPT_PARAMETERS: ScryptParameters = scryptParametersAt(14);

/**
 * The exact parameter sets a version 2 record or PHC hash may state. 2^18 is
 * readable so that raising the current cost later is a constant change that
 * re-seals automatically.
 */
export const ACCEPTED_V2_SCRYPT_PARAMETERS: readonly ScryptParameters[] = Object.freeze([
  scryptParametersAt(17),
  scryptParametersAt(18)
]);

function hasScryptParametersShape(value: unknown): value is ScryptParameters {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const keys = Object.keys(value).sort();
  if (keys.length !== PARAMETER_KEYS.length || keys.some((key, index) => key !== PARAMETER_KEYS[index])) return false;
  const record = value as Record<string, unknown>;
  return PARAMETER_KEYS.every((key) => typeof record[key] === "number");
}

function sameScryptParameters(left: ScryptParameters, right: ScryptParameters): boolean {
  return left.N === right.N && left.r === right.r && left.p === right.p && left.keyLength === right.keyLength;
}

function isValidTestOnlyWeakParameters(value: ScryptParameters | undefined): value is ScryptParameters {
  if (value === undefined || !hasScryptParametersShape(value)) return false;
  return Number.isSafeInteger(value.N)
    && value.N >= 2
    && Number.isInteger(Math.log2(value.N))
    && value.N < CURRENT_SCRYPT_PARAMETERS.N
    && value.r === SCRYPT_BLOCK_SIZE
    && value.p === SCRYPT_PARALLELISM
    && value.keyLength === SCRYPT_KEY_LENGTH;
}

/**
 * The version 2 read allowlist: an exact match against
 * `ACCEPTED_V2_SCRYPT_PARAMETERS`, or against valid `testOnlyWeakParameters`
 * when the caller passes them. Anything else, including legacy N=2^14, fails.
 */
export function isAcceptedV2ScryptParameters(value: unknown, testOnlyWeakParameters?: ScryptParameters): value is ScryptParameters {
  if (!hasScryptParametersShape(value)) return false;
  const candidate: ScryptParameters = value;
  if (ACCEPTED_V2_SCRYPT_PARAMETERS.some((accepted) => sameScryptParameters(accepted, candidate))) return true;
  return isValidTestOnlyWeakParameters(testOnlyWeakParameters) && sameScryptParameters(testOnlyWeakParameters, candidate);
}

/**
 * The derivation allowlist: legacy v1 parameters or the version 2 allowlist.
 * Checked before any derivation, so a tampered record cannot request N=2^30.
 */
export function isAcceptedScryptParameters(value: unknown, testOnlyWeakParameters?: ScryptParameters): value is ScryptParameters {
  if (hasScryptParametersShape(value) && sameScryptParameters(LEGACY_V1_SCRYPT_PARAMETERS, value)) return true;
  return isAcceptedV2ScryptParameters(value, testOnlyWeakParameters);
}

/**
 * True when a recorded version 2 cost is below the write cost, so the record
 * should be rehashed or re-sealed after a successful check. A record at an
 * equal or stronger cost is never rewritten, so rolling back to a build with a
 * lower write cost cannot downgrade it. The allowlist fixes r and p, so N alone
 * decides. A version 1 record or legacy `scrypt:` hash is rewritten regardless
 * of cost; this comparison is not asked for it.
 */
export function isBelowScryptWriteCost(recorded: ScryptParameters, write: ScryptParameters): boolean {
  return recorded.N < write.N;
}

/**
 * Parameters new seals and hashes are written at: the current parameters, or
 * `testOnlyWeakParameters` when given. Throws for weak parameters that are not
 * scrypt r=8, p=1, keyLength 32 with N a power of two below the current N.
 */
export function scryptWriteParameters(testOnlyWeakParameters?: ScryptParameters): ScryptParameters {
  if (testOnlyWeakParameters === undefined) return CURRENT_SCRYPT_PARAMETERS;
  if (!isValidTestOnlyWeakParameters(testOnlyWeakParameters)) {
    throw new RangeError("testOnlyWeakParameters must be scrypt r=8, p=1, keyLength 32 with N a power of two below the current N.");
  }
  return testOnlyWeakParameters;
}

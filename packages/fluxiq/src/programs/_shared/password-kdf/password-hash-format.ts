import { decodeKdfSalt } from "./kdf-salt.ts";
import { LEGACY_V1_SCRYPT_PARAMETERS } from "./scrypt-parameters.ts";
import type { ScryptParameters } from "./types.ts";

const DERIVED_KEY_BYTES = 32;

// `$scrypt$ln=<log2 N>,r=<r>,p=<p>$<salt>$<hash>`, salt and hash in base64url
// without padding. Parameters are canonical decimals with no leading zeros.
// The salt is base64url of the bytes scrypt derives from (standard PHC).
const PHC_PATTERN = /^\$scrypt\$ln=([1-9][0-9]?),r=([1-9][0-9]{0,2}),p=([1-9][0-9]{0,2})\$([A-Za-z0-9_-]{22,86})\$([A-Za-z0-9_-]{43})$/;
// Legacy `scrypt:<salt>:<hash>` written by Identity Access before version 2,
// whose salt text itself is the scrypt salt.
const LEGACY_PATTERN = /^scrypt:([A-Za-z0-9_-]{22,88}):([A-Za-z0-9_-]{43})$/;

export type ParsedPasswordHash = {
  readonly form: "phc" | "legacy";
  readonly parameters: ScryptParameters;
  /** The scrypt salt input: decoded bytes for the PHC form, the salt text as written for the legacy form. */
  readonly salt: Buffer | string;
  readonly hash: Buffer;
};

function decodeDerivedKey(text: string | undefined): Buffer | null {
  if (text === undefined) return null;
  const bytes = Buffer.from(text, "base64url");
  // Reject non-canonical encodings whose unused trailing bits are set.
  return bytes.length === DERIVED_KEY_BYTES && bytes.toString("base64url") === text ? bytes : null;
}

/** Writes a PHC-form scrypt password hash from the salt bytes scrypt derived from. */
export function formatScryptPasswordHash(parameters: ScryptParameters, salt: Buffer, hash: Buffer): string {
  return `$scrypt$ln=${Math.log2(parameters.N)},r=${parameters.r},p=${parameters.p}$${salt.toString("base64url")}$${hash.toString("base64url")}`;
}

/**
 * Reads a PHC-form or legacy scrypt password hash. Returns null for anything
 * malformed; it never checks the parameters against an allowlist.
 */
export function parseScryptPasswordHash(encoded: string): ParsedPasswordHash | null {
  const phc = PHC_PATTERN.exec(encoded);
  if (phc) {
    const [, ln, r, p, saltText, hashText] = phc;
    const hash = decodeDerivedKey(hashText);
    const salt = saltText === undefined ? null : decodeKdfSalt(saltText);
    if (!hash || !salt) return null;
    return {
      form: "phc",
      parameters: { N: 2 ** Number(ln), r: Number(r), p: Number(p), keyLength: DERIVED_KEY_BYTES },
      salt,
      hash
    };
  }
  const legacy = LEGACY_PATTERN.exec(encoded);
  if (legacy) {
    const [, saltText, hashText] = legacy;
    const hash = decodeDerivedKey(hashText);
    if (!hash || saltText === undefined) return null;
    return { form: "legacy", parameters: LEGACY_V1_SCRYPT_PARAMETERS, salt: saltText, hash };
  }
  return null;
}

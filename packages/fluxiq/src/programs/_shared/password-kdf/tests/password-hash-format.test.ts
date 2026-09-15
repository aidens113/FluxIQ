import { describe, expect, it } from "vitest";
import { formatScryptPasswordHash, parseScryptPasswordHash } from "../password-hash-format.ts";
import { LEGACY_V1_SCRYPT_PARAMETERS } from "../scrypt-parameters.ts";

const SALT = "ZHVtbXktc2FsdC0xNmJ5dA";
const SALT_BYTES = Buffer.from(SALT, "base64url");
const KEY = Buffer.alloc(32, 7);
const KEY_TEXT = KEY.toString("base64url");

function flipLastCharacterLowBit(text: string): string {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
  const last = alphabet.indexOf(text.slice(-1));
  return `${text.slice(0, -1)}${alphabet[last ^ 1]}`;
}

describe("scrypt password hash format", () => {
  it("uses a canonical 16-byte salt fixture", () => {
    expect(SALT_BYTES).toHaveLength(16);
    expect(SALT_BYTES.toString("base64url")).toBe(SALT);
  });

  it("writes the salt bytes and reads them back decoded in the PHC form", () => {
    const encoded = formatScryptPasswordHash({ N: 2 ** 17, r: 8, p: 1, keyLength: 32 }, SALT_BYTES, KEY);
    expect(encoded).toBe(`$scrypt$ln=17,r=8,p=1$${SALT}$${KEY_TEXT}`);

    const parsed = parseScryptPasswordHash(encoded);
    expect(parsed?.form).toBe("phc");
    expect(parsed?.parameters).toEqual({ N: 131_072, r: 8, p: 1, keyLength: 32 });
    expect(Buffer.isBuffer(parsed?.salt)).toBe(true);
    expect(parsed?.salt).toEqual(SALT_BYTES);
    expect(parsed?.hash.equals(KEY)).toBe(true);
  });

  it("reads the legacy form at the v1 parameters with the salt text as written", () => {
    const parsed = parseScryptPasswordHash(`scrypt:${SALT}:${KEY_TEXT}`);
    expect(parsed?.form).toBe("legacy");
    expect(parsed?.parameters).toBe(LEGACY_V1_SCRYPT_PARAMETERS);
    expect(parsed?.salt).toBe(SALT);
    expect(parsed?.hash.equals(KEY)).toBe(true);

    const nonCanonicalSalt = flipLastCharacterLowBit(SALT);
    expect(parseScryptPasswordHash(`scrypt:${nonCanonicalSalt}:${KEY_TEXT}`)?.salt).toBe(nonCanonicalSalt);
  });

  it("parses out-of-allowlist parameters without judging them", () => {
    expect(parseScryptPasswordHash(`$scrypt$ln=30,r=8,p=1$${SALT}$${KEY_TEXT}`)?.parameters.N).toBe(2 ** 30);
  });

  it.each<[string, string]>([
    ["empty", ""],
    ["a bare prefix", "scrypt"],
    ["empty legacy fields", "scrypt::"],
    ["a short legacy salt", `scrypt:c2FsdA:${KEY_TEXT}`],
    ["a legacy key of the wrong length", `scrypt:${SALT}:${Buffer.alloc(31).toString("base64url")}`],
    ["another legacy prefix", `bcrypt:${SALT}:${KEY_TEXT}`],
    ["a missing PHC hash", `$scrypt$ln=17,r=8,p=1$${SALT}$`],
    ["a padded PHC hash", `$scrypt$ln=17,r=8,p=1$${SALT}$${KEY_TEXT}=`],
    ["a non-canonical PHC salt", `$scrypt$ln=17,r=8,p=1$${flipLastCharacterLowBit(SALT)}$${KEY_TEXT}`],
    ["a PHC salt over 64 bytes", `$scrypt$ln=17,r=8,p=1$${Buffer.alloc(65, 1).toString("base64url")}$${KEY_TEXT}`],
    ["leading zeros", `$scrypt$ln=017,r=8,p=1$${SALT}$${KEY_TEXT}`],
    ["reordered parameters", `$scrypt$r=8,ln=17,p=1$${SALT}$${KEY_TEXT}`],
    ["a standard-base64 character", `$scrypt$ln=17,r=8,p=1$${SALT}$${KEY_TEXT.slice(0, -1)}+`],
    ["a non-canonical hash", `$scrypt$ln=17,r=8,p=1$${SALT}$${flipLastCharacterLowBit(KEY_TEXT)}`],
    ["an extra segment", `$scrypt$ln=17,r=8,p=1$${SALT}$${KEY_TEXT}$extra`],
    ["a trailing newline", `$scrypt$ln=17,r=8,p=1$${SALT}$${KEY_TEXT}\n`],
    ["another algorithm", `$argon2id$ln=17,r=8,p=1$${SALT}$${KEY_TEXT}`]
  ])("returns null for %s", (_label, encoded) => {
    expect(parseScryptPasswordHash(encoded)).toBeNull();
  });
});

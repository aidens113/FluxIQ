import { describe, expect, it } from "vitest";
import { createKdfSalt, decodeKdfSalt } from "../kdf-salt.ts";

function flipLastCharacterLowBit(text: string): string {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
  const last = alphabet.indexOf(text.slice(-1));
  return `${text.slice(0, -1)}${alphabet[last ^ 1]}`;
}

describe("KDF salt", () => {
  it("creates 16 fresh random bytes", () => {
    const first = createKdfSalt();
    const second = createKdfSalt();
    expect(Buffer.isBuffer(first)).toBe(true);
    expect(first).toHaveLength(16);
    expect(first.equals(second)).toBe(false);
  });

  it("decodes stored base64url text back to the same bytes", () => {
    const salt = createKdfSalt();
    const text = salt.toString("base64url");
    expect(text).toMatch(/^[A-Za-z0-9_-]{22}$/);
    expect(decodeKdfSalt(text)?.equals(salt)).toBe(true);

    const longest = Buffer.alloc(64, 5);
    expect(decodeKdfSalt(longest.toString("base64url"))?.equals(longest)).toBe(true);
  });

  it.each<[string, unknown]>([
    ["empty text", ""],
    ["15 bytes", Buffer.alloc(15, 1).toString("base64url")],
    ["65 bytes", Buffer.alloc(65, 1).toString("base64url")],
    ["padded base64", Buffer.alloc(16, 1).toString("base64")],
    ["standard-base64 characters", Buffer.alloc(16, 0xfb).toString("base64").replace(/=+$/, "")],
    ["a non-canonical final character", flipLastCharacterLowBit(Buffer.alloc(16, 7).toString("base64url"))],
    ["surrounding whitespace", ` ${Buffer.alloc(16, 1).toString("base64url")}`],
    ["a non-string", 42]
  ])("returns null for %s", (_label, text) => {
    expect(decodeKdfSalt(text as string)).toBeNull();
  });
});

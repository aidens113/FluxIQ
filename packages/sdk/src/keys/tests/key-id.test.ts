import { createHash, generateKeyPairSync } from "node:crypto";
import { describe, expect, it } from "vitest";
import { fluxiqKeyId } from "../key-id.ts";

describe("fluxiqKeyId", () => {
  it("is fxk_ and the first 26 base64url characters of SHA-256 of the SPKI DER", () => {
    const spki = generateKeyPairSync("ed25519").publicKey.export({ format: "der", type: "spki" });
    const id = fluxiqKeyId(spki);
    expect(id).toBe(`fxk_${createHash("sha256").update(spki).digest("base64url").slice(0, 26)}`);
    expect(id).toMatch(/^fxk_[A-Za-z0-9_-]{26}$/u);
  });
});

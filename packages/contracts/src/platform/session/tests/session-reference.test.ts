// Session digests and references: the forms a session may take outside the server.
import { describe, expect, it } from "vitest";
import { isSessionDigest, isSessionReference } from "../index.ts";

describe("session references", () => {
  it("accepts a lower-case SHA-256 hex digest only", () => {
    expect(isSessionDigest("0".repeat(64))).toBe(true);
    for (const value of ["0".repeat(63), "A".repeat(64), "0b5e7c1a-3f9d-4a55-8e2c-9d1f00aa11bb", 7]) expect(isSessionDigest(value)).toBe(false);
  });

  it("accepts a digest or a gateway session reference, never a raw session id", () => {
    expect(isSessionReference("e".repeat(64))).toBe(true);
    expect(isSessionReference("client-gateway:gw.1")).toBe(true);
    for (const value of ["0b5e7c1a-3f9d-4a55-8e2c-9d1f00aa11bb", "client-gateway:", "client-gateway:a b", "panel:abc", ""]) expect(isSessionReference(value)).toBe(false);
  });
});

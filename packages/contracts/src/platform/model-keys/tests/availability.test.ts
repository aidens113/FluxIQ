import { describe, expect, it } from "vitest";
import { readModelKeyAvailability } from "../availability.ts";

describe("safe model-key availability", () => {
  it("accepts only the supported causes without forwarding private fields", () => {
    expect(readModelKeyAvailability({ state: "available", secret: "not-forwarded" })).toEqual({ state: "available" });
    for (const code of ["legacy_recovery_required", "host_protection_unavailable", "ciphertext_invalid"]) {
      expect(readModelKeyAvailability({ state: "unavailable", code, secret: "not-forwarded" })).toEqual({ state: "unavailable", code });
    }
  });
  it("does not confuse old locks, unknown causes or malformed responses with readiness", () => {
    for (const value of [null, [], "available", {}, { state: "locked" }, { state: "unavailable" }, { state: "unavailable", code: "first_unlock" }, { state: "available", code: "ciphertext_invalid" }]) {
      expect(readModelKeyAvailability(value)).toBeNull();
    }
  });
});

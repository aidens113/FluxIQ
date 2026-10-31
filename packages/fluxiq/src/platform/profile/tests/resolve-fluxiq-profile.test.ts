import { describe, expect, it } from "vitest";
import { resolveFluxIQProfile } from "../index.ts";

describe("resolveFluxIQProfile", () => {
  it("is local when unset or empty", () => {
    expect(resolveFluxIQProfile({})).toBe("local");
    expect(resolveFluxIQProfile({ FLUXIQ_PROFILE: "  " })).toBe("local");
  });

  it.each(["local", "self-hosted", "service"] as const)("names %s", (profile) => {
    expect(resolveFluxIQProfile({ FLUXIQ_PROFILE: profile })).toBe(profile);
  });

  it("throws on an unknown profile", () => {
    expect(() => resolveFluxIQProfile({ FLUXIQ_PROFILE: "cloud" })).toThrow(/FLUXIQ_PROFILE must be/);
  });
});

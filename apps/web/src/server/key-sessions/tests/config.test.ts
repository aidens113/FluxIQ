import { describe, expect, it } from "vitest";
import { keySessionConfig } from "../config";

describe("key session instance configuration", () => {
  it("requires an explicit stable identity outside the local profile", () => {
    expect(() => keySessionConfig({ FLUXIQ_PROFILE: "service", FLUXIQ_PUBLIC_ORIGIN: "https://app.example.test" })).toThrow("FLUXIQ_INSTANCE_ID");
    expect(() => keySessionConfig({ FLUXIQ_INSTANCE_ID: "bad\nidentity" })).toThrow("FLUXIQ_INSTANCE_ID");
  });
  it("derives a stable instance for the local profile when none is set (the 503 cause)", () => {
    const first = keySessionConfig({});
    expect(first.instanceId).toMatch(/^local-[0-9a-f]{16}$/u);
    expect(keySessionConfig({})).toEqual(first);
    expect(keySessionConfig({ FLUXIQ_INSTANCE_ID: "mine" }).instanceId).toBe("mine");
  });
  it("uses the configured service origin and stable instance", () => {
    expect(keySessionConfig({ FLUXIQ_PROFILE: "service", FLUXIQ_PUBLIC_ORIGIN: "https://app.example.test", FLUXIQ_INSTANCE_ID: "production-1" })).toEqual({ origin: "https://app.example.test", instanceId: "production-1" });
    expect(() => keySessionConfig({ FLUXIQ_PROFILE: "service", FLUXIQ_PUBLIC_ORIGIN: "http://app.example.test", FLUXIQ_INSTANCE_ID: "production-1" })).toThrow();
  });
});

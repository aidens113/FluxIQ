import { describe, expect, it } from "vitest";
import { keySessionConfig } from "../config";

describe("key session instance configuration", () => {
  it("requires an explicit stable identity", () => {
    expect(() => keySessionConfig({})).toThrow("FLUXIQ_INSTANCE_ID");
    expect(() => keySessionConfig({ FLUXIQ_INSTANCE_ID: "bad\nidentity" })).toThrow("FLUXIQ_INSTANCE_ID");
  });
  it("uses the configured service origin and stable instance", () => {
    expect(keySessionConfig({ FLUXIQ_PROFILE: "service", FLUXIQ_PUBLIC_ORIGIN: "https://app.example.test", FLUXIQ_INSTANCE_ID: "production-1" })).toEqual({ origin: "https://app.example.test", instanceId: "production-1" });
    expect(() => keySessionConfig({ FLUXIQ_PROFILE: "service", FLUXIQ_PUBLIC_ORIGIN: "http://app.example.test", FLUXIQ_INSTANCE_ID: "production-1" })).toThrow();
  });
});

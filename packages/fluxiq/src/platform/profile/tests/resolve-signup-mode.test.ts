import { describe, expect, it } from "vitest";
import { resolveFluxIQDeploymentSettings } from "../index.ts";

const HOSTED = { FLUXIQ_PUBLIC_ORIGIN: "https://app.example.com" };

describe("FLUXIQ_SIGNUP", () => {
  it("is off by default on every profile, and when empty or off", () => {
    expect(resolveFluxIQDeploymentSettings({}).signup).toBe("off");
    expect(resolveFluxIQDeploymentSettings({ FLUXIQ_PROFILE: "service", ...HOSTED }).signup).toBe("off");
    expect(resolveFluxIQDeploymentSettings({ FLUXIQ_PROFILE: "service", ...HOSTED, FLUXIQ_SIGNUP: " " }).signup).toBe("off");
    expect(resolveFluxIQDeploymentSettings({ FLUXIQ_PROFILE: "service", ...HOSTED, FLUXIQ_SIGNUP: "off" }).signup).toBe("off");
  });

  it("opens only on the service profile", () => {
    expect(resolveFluxIQDeploymentSettings({ FLUXIQ_PROFILE: "service", ...HOSTED, FLUXIQ_SIGNUP: " open " }).signup).toBe("open");
    expect(resolveFluxIQDeploymentSettings({ FLUXIQ_PROFILE: "self-hosted", ...HOSTED, FLUXIQ_SIGNUP: "open" }).signup).toBe("off");
    expect(resolveFluxIQDeploymentSettings({ FLUXIQ_SIGNUP: "open" }).signup).toBe("off");
  });

  it("refuses any other value, naming the variable only", () => {
    expect(() => resolveFluxIQDeploymentSettings({ FLUXIQ_PROFILE: "service", ...HOSTED, FLUXIQ_SIGNUP: "on" })).toThrow(/^FLUXIQ_SIGNUP must be off or open\.$/u);
    expect(() => resolveFluxIQDeploymentSettings({ FLUXIQ_SIGNUP: "Open" })).toThrow(/FLUXIQ_SIGNUP/u);
  });
});

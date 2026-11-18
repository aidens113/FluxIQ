import { describe, expect, it } from "vitest";
import { environmentDriverFromEnv } from "../environment-driver-from-env";

describe("environmentDriverFromEnv", () => {
  it("builds the fake driver, and refuses an unset or unknown one, naming the setting", () => {
    expect(environmentDriverFromEnv({ FLUXIQ_ENVIRONMENT_DRIVER: "fake" }).kind).toBe("fake");
    expect(() => environmentDriverFromEnv({})).toThrow(/environments.driver_unset: FLUXIQ_ENVIRONMENT_DRIVER/u);
    expect(() => environmentDriverFromEnv({ FLUXIQ_ENVIRONMENT_DRIVER: "docker" })).toThrow(/environments.driver_unknown/u);
  });
});

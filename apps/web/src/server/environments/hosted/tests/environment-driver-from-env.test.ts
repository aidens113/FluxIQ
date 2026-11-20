import { describe, expect, it } from "vitest";
import { environmentDriverFromEnv } from "../environment-driver-from-env";

const SERVICE = { FLUXIQ_PROFILE: "service", FLUXIQ_PUBLIC_ORIGIN: "https://app.fluxiq.localhost", FLUXIQ_INSTANCE_ID: "fluxiq-local" };
const DOCKER = { ...SERVICE, FLUXIQ_ENVIRONMENT_DRIVER: "docker", FLUXIQ_ENVIRONMENT_DOCKER_PROJECT: "fluxiq-local", FLUXIQ_ENVIRONMENT_DOCKER_IMAGE: "fluxiq-cloud/runner:0.1.0", FLUXIQ_ENVIRONMENT_DOCKER_NETWORK: "fluxiq-local_runners" };

describe("environmentDriverFromEnv", () => {
  it("builds the fake driver, and refuses an unset or unknown one, naming the setting", () => {
    expect(environmentDriverFromEnv({ FLUXIQ_ENVIRONMENT_DRIVER: "fake" }).kind).toBe("fake");
    expect(() => environmentDriverFromEnv({})).toThrow(/environments.driver_unset: FLUXIQ_ENVIRONMENT_DRIVER/u);
    expect(() => environmentDriverFromEnv({ FLUXIQ_ENVIRONMENT_DRIVER: "vm" })).toThrow(/environments.driver_unknown/u);
  });

  it("builds the docker driver from its project, image and network, and refuses it without one, naming the setting", () => {
    expect(environmentDriverFromEnv(DOCKER).kind).toBe("docker");
    for (const name of ["FLUXIQ_ENVIRONMENT_DOCKER_PROJECT", "FLUXIQ_ENVIRONMENT_DOCKER_IMAGE", "FLUXIQ_ENVIRONMENT_DOCKER_NETWORK"]) {
      expect(() => environmentDriverFromEnv({ ...DOCKER, [name]: "" })).toThrow(new RegExp(`environments.driver_incomplete: the docker driver needs ${name}`, "u"));
    }
    expect(() => environmentDriverFromEnv({ ...DOCKER, FLUXIQ_ENVIRONMENT_RUNNER_PIDS: "many" })).toThrow(/FLUXIQ_ENVIRONMENT_RUNNER_PIDS/u);
  });
});

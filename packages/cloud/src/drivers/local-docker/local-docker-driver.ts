import { buildCloudPlan } from "../../plan/index.ts";
import type { DriverContext, PlatformDriver } from "../types.ts";
import { downLocalDocker } from "./down-local-docker.ts";
import { statusLocalDocker } from "./status-local-docker.ts";
import { upLocalDocker } from "./up-local-docker.ts";

/**
 * The `local-docker` driver: Docker Compose on the machine `fluxiq-cloud`
 * runs on. That is a laptop rehearsing the deployment, or the real server
 * itself, with the same files and a production config.
 */
export function localDockerDriver(context: DriverContext, packageVersion: string): PlatformDriver {
  return {
    name: "local-docker",
    plan: (config) => buildCloudPlan(config, packageVersion),
    up: (plan, options) => upLocalDocker(plan, options, context),
    down: (state, options) => downLocalDocker(state, options, context),
    status: (state) => statusLocalDocker(state, context)
  };
}

import type { CloudDriverName } from "../config/index.ts";
import { localDockerDriver } from "./local-docker/index.ts";
import type { DriverContext, PlatformDriver } from "./types.ts";
import { unbuiltDriver } from "./unbuilt-driver.ts";

/** The driver a config's `driver` names. Only `local-docker` is built; the others refuse. */
export function createPlatformDriver(name: CloudDriverName, context: DriverContext, packageVersion: string): PlatformDriver {
  return name === "local-docker" ? localDockerDriver(context, packageVersion) : unbuiltDriver(name);
}

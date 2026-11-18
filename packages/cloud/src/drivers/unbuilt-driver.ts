import type { CloudDriverName } from "../config/index.ts";
import type { PlatformDriver } from "./types.ts";

/**
 * A driver a config may name but that does not exist yet (`vm` and the
 * clouds): every operation refuses with the same clear error, before
 * anything is touched. `render` still works for such a config, because it
 * needs no driver.
 */
export function unbuiltDriver(name: Exclude<CloudDriverName, "local-docker">): PlatformDriver {
  const refuse = (): never => {
    throw new Error(`The "${name}" driver is not built yet. Use "driver": "local-docker" (on this machine or on the server itself), or "fluxiq-cloud render" to write the files without deploying.`);
  };
  return { name, plan: refuse, up: refuse, down: refuse, status: refuse };
}

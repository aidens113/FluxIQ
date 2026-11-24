import type { SQLiteEnvironmentStore } from "fluxiq/platform";
import { getEnvironmentStore } from "./environment-store";

/**
 * The environment store of this web server's platform root, the primary
 * instance's FluxIQ root. Environments are platform-scope records (never one
 * workspace's), so routes ask here instead of reaching the primary instance
 * themselves. Imported on use: the runtime constructs the workspace manager.
 */
export async function getPlatformEnvironmentStore(): Promise<SQLiteEnvironmentStore> {
  const { getFluxIQAfterReload } = await import("../../lib/fluxiq");
  return getEnvironmentStore((await getFluxIQAfterReload()).paths.fluxiq);
}

import type { FluxIQDeploymentSettings } from "fluxiq/platform/profile";
import { startProvisioningListenerFromEnv } from "./start-provisioning-listener-from-env";
import type { ProvisioningListenerHandle, ProvisioningListenerServices } from "./types";

/**
 * Starts the private listener only on the `service` profile and only when the
 * token file is configured; any other profile answers null whatever the
 * environment holds. The environment entry then requires
 * `FLUXIQ_PROVISIONING_LISTEN` and refuses a public bind.
 */
export async function startProvisioningListenerForProfile(
  settings: Pick<FluxIQDeploymentSettings, "profile">,
  env: Readonly<Record<string, string | undefined>>,
  getServices: () => Promise<ProvisioningListenerServices>,
  log: (line: string) => void
): Promise<ProvisioningListenerHandle | null> {
  if (settings.profile !== "service") return null;
  return startProvisioningListenerFromEnv(env, getServices, { log });
}

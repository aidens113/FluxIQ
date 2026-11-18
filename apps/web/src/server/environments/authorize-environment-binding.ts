import { FLUXIQ_MANAGED_HOST_PRINCIPAL } from "fluxiq/client-gateway";
import { environmentOfHost } from "fluxiq/platform";
import type { ClientTrustBinding, EnvironmentStore } from "fluxiq/platform";
import { environmentLive } from "./environment-live";

/**
 * A managed host's stored trust routes only when it is a dedicated
 * environment's client, enrolled by the managed-host principal with the
 * environment's named profile, and that environment is recorded as owned by
 * the binding's workspace and running. A person's membership plays no part:
 * the environment's admitted operation is the authority.
 */
export async function authorizeEnvironmentBinding(binding: ClientTrustBinding, deps: {
  store: Pick<EnvironmentStore, "get">;
  primaryWorkspaceId: string;
}): Promise<boolean> {
  const host = binding.managedHost;
  if (host === undefined || host.profile !== "named" || binding.approvedByUserId !== FLUXIQ_MANAGED_HOST_PRINCIPAL) return false;
  if (binding.workspaceId === deps.primaryWorkspaceId) return false;
  const environmentId = environmentOfHost(host.hostId);
  return environmentId !== null && await environmentLive(deps.store, binding.workspaceId, environmentId);
}

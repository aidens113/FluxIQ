import type { ClientGatewayClientHello } from "fluxiq/client-gateway";
import { getBrowserTrustRepository } from "./repository";
import { resolveTrustedClientRoute } from "./resolve-route";

/** Hosted ordinary-client routing; the transport independently validates the hello and admitted Origin. */
export async function resolveServiceClientGatewayRoute(input: { hello: ClientGatewayClientHello; signal: AbortSignal }) {
  // Imported on use: the runtime constructs the authority and starts its listener.
  const { getFluxIQAfterReload, getFluxIQWorkspaces } = await import("../../lib/fluxiq");
  const primary = await getFluxIQAfterReload();
  const manager = getFluxIQWorkspaces();
  if (manager.tenancy !== "multi") return null;
  return resolveTrustedClientRoute(input, {
    repository: getBrowserTrustRepository(primary.paths.fluxiq),
    primaryWorkspaceId: manager.primaryWorkspaceId,
    acquire: (workspaceId) => manager.acquire(workspaceId),
    authorize: async (binding) => {
      // Managed hosts require their own current host/run/lease authority, never a fabricated human membership.
      // Until the managed-ticket routing adapter is installed this entry point cannot admit one.
      if (binding.managedHost) return false;
      const { getPlatformServices } = await import("../provisioning-listener");
      const { keySessionEligible } = await import("../key-sessions");
      const platform = await getPlatformServices();
      return keySessionEligible({
        userId: binding.approvedByUserId, workspaceId: binding.workspaceId,
        tenancy: "multi", primaryWorkspaceId: manager.primaryWorkspaceId, store: platform.store,
        enabledUser: async (id) => (await primary.programs.identityAccess.snapshot()).users.some((user) => user.id === id && user.enabled)
      });
    }
  });
}

import type { ClientGatewayClientHello } from "fluxiq/client-gateway";
import { getBrowserTrustRepository } from "./repository";
import { resolveTrustedClientRoute } from "./resolve-route";
import { authorizeServiceClientBinding } from "./authorize-binding";

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
    authorize: authorizeServiceClientBinding
  });
}

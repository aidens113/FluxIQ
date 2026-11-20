import type { ClientGatewayClientHello } from "fluxiq/client-gateway";
import { environmentEnrolmentRoutes, getEnvironmentStore, resolveEnvironmentEnrolmentRoute } from "../environments";
import { getBrowserTrustRepository } from "./repository";
import { resolveTrustedClientRoute } from "./resolve-route";
import { authorizeServiceClientBinding } from "./authorize-binding";

/** Hosted client routing; the transport independently validates the hello and admitted Origin. */
export async function resolveServiceClientGatewayRoute(input: { hello: ClientGatewayClientHello; signal: AbortSignal }) {
  // Imported on use: the runtime constructs the authority and starts its listener.
  const { getFluxIQAfterReload, getFluxIQWorkspaces } = await import("../../lib/fluxiq");
  const primary = await getFluxIQAfterReload();
  const manager = getFluxIQWorkspaces();
  if (manager.tenancy !== "multi") return null;
  const acquire = (workspaceId: string) => manager.acquire(workspaceId);
  return resolveTrustedClientRoute(input, {
    repository: getBrowserTrustRepository(primary.paths.fluxiq),
    primaryWorkspaceId: manager.primaryWorkspaceId,
    acquire,
    authorize: authorizeServiceClientBinding,
    // A dedicated environment's client enrols at the tenant whose gateway minted its ticket.
    enrolment: (enrolment) => resolveEnvironmentEnrolmentRoute(enrolment, {
      routes: environmentEnrolmentRoutes,
      store: getEnvironmentStore(primary.paths.fluxiq),
      primaryWorkspaceId: manager.primaryWorkspaceId,
      acquire
    })
  });
}

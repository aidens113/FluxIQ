import { authorizeServiceClientBinding } from "./authorize-binding";
import { getBrowserTrustRepository } from "./repository";
import { resolveTrustedClientHttpRoute } from "./resolve-http-route";

/** Composition for ordinary browser HTTP tokens; SDK sessions and managed tickets have separate authorities. */
export async function resolveServiceClientHttpRoute(token: string) {
  const { getFluxIQAfterReload, getFluxIQWorkspaces } = await import("../../lib/fluxiq");
  const primary = await getFluxIQAfterReload();
  const manager = getFluxIQWorkspaces();
  if (manager.tenancy !== "multi") return null;
  return resolveTrustedClientHttpRoute(token, {
    repository: getBrowserTrustRepository(primary.paths.fluxiq),
    primaryWorkspaceId: manager.primaryWorkspaceId,
    authorize: authorizeServiceClientBinding,
    acquire: (workspaceId) => manager.acquire(workspaceId)
  });
}

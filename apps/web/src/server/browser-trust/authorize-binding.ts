import { workspaceAccountEligible } from "../account-access";
import { authorizeEnvironmentBinding, getEnvironmentStore } from "../environments";
import type { ClientTrustBinding } from "fluxiq/platform";

/**
 * Ordinary browser credentials use current human account membership. A
 * managed host's credential is a dedicated environment's client, judged by
 * that environment's record alone and never by a person's membership.
 */
export async function authorizeServiceClientBinding(binding: ClientTrustBinding): Promise<boolean> {
  const { getFluxIQAfterReload, getFluxIQWorkspaces } = await import("../../lib/fluxiq");
  const primary = await getFluxIQAfterReload();
  const manager = getFluxIQWorkspaces();
  if (manager.tenancy !== "multi") return false;
  if (binding.managedHost) return authorizeEnvironmentBinding(binding, { store: getEnvironmentStore(primary.paths.fluxiq), primaryWorkspaceId: manager.primaryWorkspaceId });
  const { getPlatformServices } = await import("../provisioning-listener");
  return workspaceAccountEligible({
    userId: binding.approvedByUserId, workspaceId: binding.workspaceId,
    tenancy: "multi", primaryWorkspaceId: manager.primaryWorkspaceId, store: (await getPlatformServices()).store,
    enabledUser: async (id) => (await primary.programs.identityAccess.snapshot()).users.some((user) => user.id === id && user.enabled)
  });
}

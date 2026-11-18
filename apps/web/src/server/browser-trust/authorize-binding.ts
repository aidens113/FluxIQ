import { workspaceAccountEligible } from "../account-access";
import type { ClientTrustBinding } from "fluxiq/platform";

/** Ordinary browser credentials use current human account membership, never managed-host authority. */
export async function authorizeServiceClientBinding(binding: ClientTrustBinding): Promise<boolean> {
  if (binding.managedHost) return false;
  const { getFluxIQAfterReload, getFluxIQWorkspaces } = await import("../../lib/fluxiq");
  const primary = await getFluxIQAfterReload();
  const manager = getFluxIQWorkspaces();
  if (manager.tenancy !== "multi") return false;
  const { getPlatformServices } = await import("../provisioning-listener");
  return workspaceAccountEligible({
    userId: binding.approvedByUserId, workspaceId: binding.workspaceId,
    tenancy: "multi", primaryWorkspaceId: manager.primaryWorkspaceId, store: (await getPlatformServices()).store,
    enabledUser: async (id) => (await primary.programs.identityAccess.snapshot()).users.some((user) => user.id === id && user.enabled)
  });
}

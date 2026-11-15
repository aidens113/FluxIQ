import { getBrowserTrustRepository } from "../browser-trust";

/** A proved ordinary client may end its own trust even after its owner has been disabled. */
export async function revokeConnectCredential(token: string): Promise<void> {
  const { getFluxIQAfterReload, getFluxIQWorkspaces } = await import("../../lib/fluxiq");
  const primary = await getFluxIQAfterReload();
  const manager = getFluxIQWorkspaces();
  if (manager.tenancy !== "multi") throw new Error("Hosted connect is not enabled for this deployment.");
  const proof = await getBrowserTrustRepository(primary.paths.fluxiq).lookupCredential(token);
  if (proof.status === "invalid" || proof.status === "inactive") return;
  const { binding } = proof;
  if (binding.managedHost || binding.workspaceId === manager.primaryWorkspaceId) return;
  const { getPlatformServices } = await import("../provisioning-listener");
  if (!await (await getPlatformServices()).store.getWorkspace(binding.workspaceId)) return;
  const lease = await manager.acquire(binding.workspaceId);
  try {
    await lease.fluxiq.programs.clientGateway.revokeTrustedClient(binding.trustedClientId, "The client revoked its own credential.");
  } finally {
    lease.release();
  }
}

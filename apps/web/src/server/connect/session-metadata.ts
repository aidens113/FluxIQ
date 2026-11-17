import { connectUserSummarySchema, connectWorkspaceSummarySchema } from "fluxiq/platform/profile";
import type { ClientGatewaySessionMetadataProvider } from "fluxiq/client-gateway";
import { workspaceAccountEligible } from "../account-access";

/** Reconnect authority belongs to the approved client and its fixed tenant, not an old panel session. */
export function createWorkspaceSessionMetadata(workspaceId: string): ClientGatewaySessionMetadataProvider {
  return async ({ userId }) => {
    const { getFluxIQAfterReload, getFluxIQWorkspaces } = await import("../../lib/fluxiq");
    const { getPlatformServices } = await import("../provisioning-listener");
    const primary = await getFluxIQAfterReload();
    const manager = getFluxIQWorkspaces();
    const tenant = manager.get(workspaceId);
    if (manager.tenancy !== "multi" || !tenant || tenant.primary || workspaceId === manager.primaryWorkspaceId) return null;
    const { store } = await getPlatformServices();
    const account = await store.getAccount(userId);
    if (!account || account.userId !== userId || account.status !== "active" || account.deletion !== null || account.emailVerifiedAtMs === null) return null;
    const user = connectUserSummarySchema.safeParse({ userId, displayName: account.displayName, email: account.email });
    // Workspace records have no descriptive label yet; display their actual identifier.
    const workspace = connectWorkspaceSummarySchema.safeParse({ workspaceId, name: workspaceId });
    if (!user.success || !workspace.success) return null;
    if (!await workspaceAccountEligible({
      userId, workspaceId, tenancy: manager.tenancy, primaryWorkspaceId: manager.primaryWorkspaceId, store,
      enabledUser: async (id) => (await primary.programs.identityAccess.snapshot()).users.some((entry) => entry.id === id && entry.enabled)
    })) return null;
    if (getFluxIQWorkspaces() !== manager || manager.get(workspaceId) !== tenant) return null;
    return { user: user.data, workspace: workspace.data };
  };
}

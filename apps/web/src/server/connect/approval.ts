import { isSessionDigest } from "fluxiq/platform/profile";
import type { ConnectApprovalEligibility } from "fluxiq/platform";
import { defaultWorkspaceId } from "../../lib/workspaces";

/** Session ids in the identity snapshot are digests. No raw cookie is retained by connect. */
export async function validateConnectApproval(approvingSessionDigest: string): Promise<ConnectApprovalEligibility> {
  if (!isSessionDigest(approvingSessionDigest)) return { allowed: false, error: "invalid_grant" };
  const { getFluxIQAfterReload, getFluxIQWorkspaces } = await import("../../lib/fluxiq");
  const primary = await getFluxIQAfterReload();
  const manager = getFluxIQWorkspaces();
  if (manager.tenancy !== "multi") return { allowed: false, error: "invalid_grant" };
  const identity = await primary.programs.identityAccess.snapshot();
  const session = identity.sessions.find((entry) => entry.id === approvingSessionDigest && entry.expiresAtMs > Date.now());
  if (!session) return { allowed: false, error: "invalid_grant" };
  const user = identity.users.find((entry) => entry.id === session.userId);
  if (!user?.enabled) return { allowed: false, error: "account_disabled" };
  const { getPlatformServices } = await import("../provisioning-listener");
  const { store } = await getPlatformServices();
  const account = await store.getAccount(user.id);
  if (!account || account.status !== "active" || account.deletion !== null) return { allowed: false, error: "account_disabled" };
  if (account.emailVerifiedAtMs === null) return { allowed: false, error: "email_unverified" };
  const workspaceId = await defaultWorkspaceId({ userId: user.id, primaryWorkspaceId: manager.primaryWorkspaceId, store });
  if (!workspaceId) return { allowed: false, error: "invalid_grant" };
  return { allowed: true, user: { userId: user.id, displayName: account.displayName, email: account.email }, workspace: { workspaceId, name: "Workspace" } };
}

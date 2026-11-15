import { FLUXIQ_CONNECT_LIMITS } from "fluxiq/platform/profile";
import type { ClientGatewayTrustAuthority } from "fluxiq/client-gateway";
import { secretKeyPairedHolderId } from "fluxiq/secret-keys";
import { validateConnectApproval } from "./approval";

/** Bound by tenant construction, never by an incoming connect or gateway payload. */
export function createWorkspaceTrustAuthority(workspaceId: string): ClientGatewayTrustAuthority {
  async function approved(userId: string, digest: string): Promise<boolean> {
    const result = await validateConnectApproval(digest);
    return result.allowed && result.user.userId === userId && result.workspace.workspaceId === workspaceId;
  }
  return {
    validateApproval: async ({ userId, approvingSessionDigest }) => await approved(userId, approvingSessionDigest)
      ? { userId, approvingSessionDigest, maxActiveClients: FLUXIQ_CONNECT_LIMITS.maxConnectedClientsPerAccount }
      : null,
    grantCredential: async (input) => {
      if (!await approved(input.userId, input.approvingSessionDigest)) throw new Error("Client approval is no longer active.");
      const { getFluxIQWorkspaces } = await import("../../lib/fluxiq");
      const tenant = getFluxIQWorkspaces().get(workspaceId);
      if (!tenant || tenant.primary) throw new Error("The approved tenant is unavailable.");
      // A new holder starts locked. Only a later explicit key proof may box tenant keys to it.
      // Calling the service directly preserves persistence failures; the legacy observer is best-effort.
      await tenant.fluxiq.programs.secretKeys.credentialUnlocks.enrollLockedCredential({
        holderKind: "paired-client", holderId: secretKeyPairedHolderId(input.trustedClientId),
        userId: input.userId, expiresAtMs: input.expiresAt, label: "Connected client",
        approvingSessionDigest: input.approvingSessionDigest
      }, input.credential);
    }
  };
}

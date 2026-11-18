import { FLUXIQ_CONNECT_LIMITS } from "fluxiq/platform/profile";
import { ConnectCredentialRefusal, type ConnectCredentialIssueInput, type ConnectIssuedCredential } from "fluxiq/platform";
import { getBrowserTrustRepository } from "../browser-trust";
import { serializeConnectAccount } from "./account-queue";
import { validateConnectApproval } from "./approval";

/** Input is derived from consumed PKCE evidence, never directly from a public token request. */
export async function issueConnectCredential(input: ConnectCredentialIssueInput): Promise<ConnectIssuedCredential> {
  const { getFluxIQAfterReload, getFluxIQWorkspaces } = await import("../../lib/fluxiq");
  const primary = await getFluxIQAfterReload();
  return serializeConnectAccount(primary.paths.fluxiq, input.userId, async () => {
    const approval = await validateConnectApproval(input.approvingSessionDigest);
    if (!approval.allowed) throw new ConnectCredentialRefusal(approval.error);
    if (approval.user.userId !== input.userId || approval.workspace.workspaceId !== input.workspaceId) throw new ConnectCredentialRefusal("invalid_grant");
    const repository = getBrowserTrustRepository(primary.paths.fluxiq);
    const active = await repository.countActiveForUser(input.userId, {
      workspaceId: input.workspaceId, clientId: input.clientInstallId, clientInstallId: input.clientInstallId
    });
    if (active >= FLUXIQ_CONNECT_LIMITS.maxConnectedClientsPerAccount) throw new ConnectCredentialRefusal("client_limit_reached");
    const lease = await getFluxIQWorkspaces().acquire(input.workspaceId);
    try {
      const domains = lease.fluxiq.domains.summaries();
      const domainId = lease.fluxiq.activeDomainId ?? (domains.length === 1 ? domains[0]!.id : null);
      if (!domainId && domains.length > 1) throw new ConnectCredentialRefusal("invalid_grant");
      const issued = await lease.fluxiq.programs.clientGateway.trust.issue({
        clientId: input.clientInstallId, clientType: "extension", clientInstallId: input.clientInstallId,
        name: input.clientLabel, domainId, approvedByUserId: input.userId,
        approvingSessionDigest: input.approvingSessionDigest
      });
      return { credential: issued.credential, credentialExpiresAt: issued.credentialExpiresAt, connectedClientId: issued.trustedClientId };
    } finally {
      lease.release();
    }
  });
}

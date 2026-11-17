import type { ClientGatewayTrustedClient } from "@fluxiq/contracts/client-gateway";
import { classifyClientGatewayCredential } from "../../../client-gateway/service/credentials/index.ts";
import type { ClientTrustBinding, ClientTrustCredentialProof } from "../model/index.ts";

/** Uses the gateway's existing credential proof without opening or authorizing a tenant gateway. */
export function proveClientTrustCredential(workspaceId: string, client: ClientGatewayTrustedClient, token: string, now: number, options: { request?: boolean }): ClientTrustCredentialProof {
  const proof = classifyClientGatewayCredential(client, token, now, options);
  if (proof.status === "invalid") return proof;
  const binding: ClientTrustBinding = {
    workspaceId,
    trustedClientId: client.trustedClientId,
    approvedByUserId: client.approvedByUserId,
    clientId: client.clientId,
    clientType: client.clientType
  };
  if (client.domainId !== undefined) binding.domainId = client.domainId;
  if (client.managedHost !== undefined) binding.managedHost = { hostId: client.managedHost.hostId, profile: client.managedHost.profile };
  if (client.revokedAt !== undefined) return { status: "inactive", binding, reason: "revoked" };
  if (client.expiresAt <= now) return { status: "inactive", binding, reason: "expired" };
  if (proof.status === "obsolete") return { status: "obsolete", binding, reuse: proof.reuse };
  return { status: proof.status, binding };
}

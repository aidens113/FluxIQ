import { isSessionDigest } from "@fluxiq/contracts/platform";
import type { ClientGatewayApprovedTrustInput, ClientGatewayTrustApproval } from "./types.ts";
import { ClientGatewayTrustIssuanceError } from "./issuance-error.ts";

function identifier(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= 128 && value.trim() === value && !/[\u0000-\u001f\u007f]/u.test(value);
}

/** Validate and detach server input before the first asynchronous authority/persistence step. */
export function validateApprovedTrustInput(input: ClientGatewayApprovedTrustInput): ClientGatewayApprovedTrustInput {
  if (!input || !identifier(input.clientId) || !identifier(input.clientInstallId) || !identifier(input.approvedByUserId) || !isSessionDigest(input.approvingSessionDigest)
    || typeof input.name !== "string" || input.name.length < 1 || input.name.length > 100 || /[\u0000-\u001f\u007f]/u.test(input.name)
    || !["extension", "desktop-recorder", "cli", "worker", "custom"].includes(input.clientType) || (input.domainId !== null && !identifier(input.domainId))) throw new ClientGatewayTrustIssuanceError("invalid_input");
  return {
    clientId: input.clientId,
    clientType: input.clientType,
    clientInstallId: input.clientInstallId,
    name: input.name,
    domainId: input.domainId,
    approvedByUserId: input.approvedByUserId,
    approvingSessionDigest: input.approvingSessionDigest
  };
}

/** The trusted validator must vouch for the exact actor/session and an explicit positive policy limit. */
export function validateTrustApproval(input: ClientGatewayApprovedTrustInput, approval: ClientGatewayTrustApproval | null): ClientGatewayTrustApproval {
  if (!approval || approval.userId !== input.approvedByUserId || approval.approvingSessionDigest !== input.approvingSessionDigest
    || !Number.isSafeInteger(approval.maxActiveClients) || approval.maxActiveClients < 1) throw new ClientGatewayTrustIssuanceError("approval_refused");
  return { userId: approval.userId, approvingSessionDigest: approval.approvingSessionDigest, maxActiveClients: approval.maxActiveClients };
}

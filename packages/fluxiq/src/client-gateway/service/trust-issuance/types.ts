import type { ClientGatewayClientType } from "@fluxiq/contracts/client-gateway";

/** Server-only consent evidence. A public request must never choose its approver or session authority. */
export type ClientGatewayApprovedTrustInput = {
  clientId: string;
  clientType: ClientGatewayClientType;
  clientInstallId: string;
  name: string;
  domainId: string | null;
  approvedByUserId: string;
  approvingSessionDigest: string;
};

export type ClientGatewayTrustApproval = {
  userId: string;
  approvingSessionDigest: string;
  /** Active ordinary clients belonging to this owner in this gateway's authoritative store scope. */
  maxActiveClients: number;
};

/** Authenticated platform composition owns account, membership, session validation and strict key delivery. */
export type ClientGatewayTrustAuthority = {
  validateApproval(input: { userId: string; approvingSessionDigest: string }): Promise<ClientGatewayTrustApproval | null>;
  /** Mandatory and failure-propagating; the legacy best-effort custody observer cannot grant delivery. */
  grantCredential(input: { credential: string; trustedClientId: string; userId: string; approvingSessionDigest: string; expiresAt: number }): Promise<void>;
};

export type ClientGatewayIssuedTrust = { credential: string; credentialExpiresAt: number; trustedClientId: string };

export type ClientGatewayTrustIssuance = { issue(input: ClientGatewayApprovedTrustInput): Promise<ClientGatewayIssuedTrust> };

export type ClientGatewayTrustIssuanceFailure = "invalid_input" | "unavailable" | "approval_refused" | "client_limit_reached" | "persistence_failed" | "delivery_failed" | "trust_ended" | "cleanup_failed";

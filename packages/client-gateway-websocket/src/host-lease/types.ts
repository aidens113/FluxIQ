import type { CLIENT_GATEWAY_HOST_LEASE_REFUSAL_CODES, ClientGatewayHostLease } from "@fluxiq/contracts/client-gateway";

/** A host-lease refusal code, as Core names them. */
export type ClientGatewayHostLeaseRefusalCode = (typeof CLIENT_GATEWAY_HOST_LEASE_REFUSAL_CODES)[keyof typeof CLIENT_GATEWAY_HOST_LEASE_REFUSAL_CODES];

/** What a command said about its lease: none, one the client can read, or one it cannot. */
export type ClientGatewayHostLeaseReading =
  | { kind: "none" }
  | { kind: "lease"; lease: ClientGatewayHostLease }
  | { kind: "unreadable" };

/** How a readable lease stands against the highest the client has seen for its resource. */
export type ClientGatewayHostLeaseJudgement = "adopt" | "current" | "stale" | "holder_mismatch";

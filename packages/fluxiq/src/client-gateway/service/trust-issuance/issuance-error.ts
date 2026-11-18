import type { ClientGatewayTrustIssuanceFailure } from "./types.ts";

/** A sanitized refusal; never retains credentials, raw sessions or a store/provider exception cause. */
export class ClientGatewayTrustIssuanceError extends Error {
  readonly code: string;
  readonly reason: ClientGatewayTrustIssuanceFailure;

  constructor(reason: ClientGatewayTrustIssuanceFailure) {
    super("The trusted client could not be connected. Restart consent before trying again.");
    this.name = "ClientGatewayTrustIssuanceError";
    this.reason = reason;
    this.code = `client_trust.${reason}`;
  }
}

import type { ClientGatewayRevokedNotice } from "@fluxiq/contracts/client-gateway";
import type { ClientGatewayRevocationReason } from "@fluxiq/contracts/platform";

/** What a client whose trust was revoked is sent (`server.revoked`), in words a person can read. */
export function clientGatewayRevokedNotice(reason: ClientGatewayRevocationReason): ClientGatewayRevokedNotice {
  return {
    reason,
    message: reason === "credential_reused"
      ? "This client's credential was used somewhere else, so FluxIQ revoked it. Connect again to ask for a new approval."
      : "FluxIQ revoked this client's approval. Connect again to ask for a new approval."
  };
}

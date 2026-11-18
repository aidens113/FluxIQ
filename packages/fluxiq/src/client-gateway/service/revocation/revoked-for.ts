import { CLIENT_GATEWAY_REVOCATION_REASONS, type ClientGatewayRevocationReason } from "@fluxiq/contracts/platform";

/**
 * What a client is told its trust was revoked for when the caller gives only
 * the reason's text: the text itself when it is one of the protocol's reasons,
 * and otherwise `revoked_by_user`, because a person revoked it from FluxIQ.
 *
 * It never answers silence. A revocation the client is not told about (it
 * asked for it, the trust never reached it, a newer approval took over) says
 * so by passing `revokedFor: null`; silence is never read from the reason text.
 */
export function clientGatewayRevokedFor(reason: string): ClientGatewayRevocationReason {
  if ((CLIENT_GATEWAY_REVOCATION_REASONS as readonly string[]).includes(reason)) return reason as ClientGatewayRevocationReason;
  return "revoked_by_user";
}

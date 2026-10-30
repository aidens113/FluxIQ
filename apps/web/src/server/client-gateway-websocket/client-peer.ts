import type { IncomingMessage } from "node:http";
import type { ClientGatewayPeer } from "fluxiq/client-gateway";
import { clientAddressPrefix, resolveClientAddress } from "fluxiq/platform/profile";

/**
 * Where an upgrade came from: the socket's peer, or with `trustProxy` the
 * address the trusted proxy appended to `X-Forwarded-For`, and the network
 * prefix the audit may keep. The full address goes to the gateway's own
 * session record only (`ClientGatewayService.connect`), never to a log.
 */
export function resolveClientGatewayPeer(request: IncomingMessage, trustProxy: boolean): ClientGatewayPeer {
  const header = request.headers["x-forwarded-for"];
  const forwardedFor = Array.isArray(header) ? header.join(",") : header ?? null;
  const resolved = resolveClientAddress({ peerAddress: request.socket.remoteAddress ?? null, forwardedFor, trustProxy });
  return { address: resolved.address, prefix: clientAddressPrefix(resolved.address), source: resolved.source };
}

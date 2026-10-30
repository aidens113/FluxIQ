import { randomUUID } from "node:crypto";
import { CLIENT_GATEWAY_PROTOCOL_VERSION, type ClientGatewayServerMessage } from "fluxiq/client-gateway";

/** A server message the transport sends itself, outside the gateway's outbound queue, serialised. */
export function serverEnvelope<T extends ClientGatewayServerMessage["type"]>(type: T, payload: Extract<ClientGatewayServerMessage, { type: T }>["payload"]): string {
  return JSON.stringify({ id: randomUUID(), type, protocolVersion: CLIENT_GATEWAY_PROTOCOL_VERSION, timestamp: Date.now(), payload });
}

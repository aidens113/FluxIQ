import {
  CLIENT_GATEWAY_PROTOCOL_VERSION,
  type ClientGatewayClientMessage,
  type ClientGatewayEnvelope,
  type ClientGatewayServerMessage
} from "@fluxiq/contracts/client-gateway";

export type ClientGatewayMessageOptions = {
  clientId?: string;
  sessionId?: string;
  correlationId?: string;
  idFactory?: () => string;
  now?: () => number;
};

export function createClientGatewayMessage<TType extends ClientGatewayClientMessage["type"]>(
  type: TType,
  payload: Extract<ClientGatewayClientMessage, { type: TType }>["payload"],
  options: ClientGatewayMessageOptions = {}
): Extract<ClientGatewayClientMessage, { type: TType }> {
  return {
    id: options.idFactory?.() ?? `client-message.${Math.random().toString(36).slice(2)}`,
    type,
    protocolVersion: CLIENT_GATEWAY_PROTOCOL_VERSION,
    timestamp: options.now?.() ?? Date.now(),
    ...(options.sessionId !== undefined ? { sessionId: options.sessionId } : {}),
    ...(options.clientId !== undefined ? { clientId: options.clientId } : {}),
    ...(options.correlationId !== undefined ? { correlationId: options.correlationId } : {}),
    payload
  } as Extract<ClientGatewayClientMessage, { type: TType }>;
}

export function parseServerMessage(data: unknown): ClientGatewayServerMessage | null {
  const text = typeof data === "string" ? data : data instanceof ArrayBuffer ? new TextDecoder().decode(data) : "";
  if (!text) return null;
  const parsed = JSON.parse(text) as ClientGatewayEnvelope;
  if (typeof parsed.type !== "string" || !parsed.type.startsWith("server.")) return null;
  return parsed as ClientGatewayServerMessage;
}

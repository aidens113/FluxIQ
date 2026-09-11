import { randomUUID } from "node:crypto";
import { CLIENT_GATEWAY_PROTOCOL_VERSION } from "@fluxiq/contracts/client-gateway";
import type { ClientGatewayServerMessage, ClientGatewaySession } from "@fluxiq/contracts/client-gateway";
import type { ClientGatewaySessionRegistry } from "./sessions.ts";

/** Builds server messages and delivers them to a session's socket and queue. */
export class ClientGatewayTransport {
  private readonly sessions: ClientGatewaySessionRegistry;
  private readonly now: () => number;

  constructor(sessions: ClientGatewaySessionRegistry, now: () => number) {
    this.sessions = sessions;
    this.now = now;
  }

  message<TType extends ClientGatewayServerMessage["type"]>(
    type: TType,
    payload: Extract<ClientGatewayServerMessage, { type: TType }>["payload"],
    session?: ClientGatewaySession
  ): Extract<ClientGatewayServerMessage, { type: TType }> {
    return {
      id: randomUUID(),
      type,
      protocolVersion: CLIENT_GATEWAY_PROTOCOL_VERSION,
      timestamp: this.now(),
      ...(session ? { sessionId: session.sessionId, clientId: session.clientId } : {}),
      payload
    } as Extract<ClientGatewayServerMessage, { type: TType }>;
  }

  async send(sessionId: string, message: ClientGatewayServerMessage): Promise<void> {
    const session = this.sessions.require(sessionId);
    session.outbound.push(message);
    await session.socket?.send(JSON.stringify(message));
  }

  outbound(sessionId: string): ClientGatewayServerMessage[] {
    return this.sessions.get(sessionId)?.outbound ?? [];
  }

  clearOutbound(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (session) session.outbound = [];
  }
}

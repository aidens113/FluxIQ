import { randomUUID } from "node:crypto";
import { CLIENT_GATEWAY_PROTOCOL_VERSION } from "@fluxiq/contracts/client-gateway";
import type { ClientGatewayServerMessage, ClientGatewaySession, ClientGatewaySocket } from "@fluxiq/contracts/client-gateway";
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

  /**
   * Sends straight to the session's socket without entering `outbound`, which
   * has no bound, so a stream can go to a session without growing its queue.
   * Returns false when there was no socket or the send threw; a failure is
   * dropped, never thrown, because the message is disposable.
   */
  sendUnqueued(session: ClientGatewaySession & { socket?: ClientGatewaySocket }, message: ClientGatewayServerMessage): boolean {
    const socket = session.socket;
    if (!socket) return false;
    try {
      const sent = socket.send(JSON.stringify(message));
      if (sent instanceof Promise) sent.catch(() => { /* best-effort: an unqueued message to a socket that closed mid-send is disposable */ });
      return true;
    } catch {
      /* best-effort: a closed socket drops an unqueued message; the next one supersedes it */
      return false;
    }
  }

  outbound(sessionId: string): ClientGatewayServerMessage[] {
    return this.sessions.get(sessionId)?.outbound ?? [];
  }

  clearOutbound(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (session) session.outbound = [];
  }
}

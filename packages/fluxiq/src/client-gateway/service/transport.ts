import { randomUUID } from "node:crypto";
import { CLIENT_GATEWAY_PROTOCOL_VERSION } from "@fluxiq/contracts/client-gateway";
import type { ClientGatewayServerMessage, ClientGatewaySession, ClientGatewaySocket } from "@fluxiq/contracts/client-gateway";
import type { ClientGatewaySessionRegistry } from "./sessions.ts";
import { ClientGatewayTraceTap } from "./trace-tap/index.ts";
import type { ClientGatewayIdKind } from "./types.ts";
import type { InternalSession } from "./types.ts";

/** Builds server messages and delivers them to a session's socket and queue. */
export class ClientGatewayTransport {
  private readonly sessions: ClientGatewaySessionRegistry;
  private readonly now: () => number;
  private readonly trace: ClientGatewayTraceTap;
  private readonly createId: (kind: ClientGatewayIdKind) => string;

  /**
   * `trace` records every message sent (`./trace-tap/`); omitted, nothing is
   * recorded. `createId` mints message ids; omitted, `randomUUID()`.
   */
  constructor(sessions: ClientGatewaySessionRegistry, now: () => number, trace?: ClientGatewayTraceTap, createId?: (kind: ClientGatewayIdKind) => string) {
    this.sessions = sessions;
    this.now = now;
    this.trace = trace ?? new ClientGatewayTraceTap({ source: undefined, clientIdOf: () => undefined });
    this.createId = createId ?? (() => randomUUID());
  }

  message<TType extends ClientGatewayServerMessage["type"]>(
    type: TType,
    payload: Extract<ClientGatewayServerMessage, { type: TType }>["payload"],
    session?: ClientGatewaySession
  ): Extract<ClientGatewayServerMessage, { type: TType }> {
    // The id is minted before the clock is read, so a replay can hand back a recorded message's id and then its time.
    return {
      id: this.createId("message"),
      type,
      protocolVersion: CLIENT_GATEWAY_PROTOCOL_VERSION,
      timestamp: this.now(),
      ...(session ? { sessionId: session.sessionId, clientId: session.clientId } : {}),
      payload
    } as Extract<ClientGatewayServerMessage, { type: TType }>;
  }

  async send(sessionId: string, message: ClientGatewayServerMessage, hooks?: {
    admit(session: InternalSession | null): void;
    prepare(): void;
    invoking(): void;
    refuse(error: unknown): never;
  }): Promise<void> {
    let session: InternalSession, raw: string, queued: InternalSession | undefined;
    const ready = (): InternalSession => {
      try { return this.sessions.requireReady(sessionId); }
      catch (error) { hooks?.admit(null);
        throw error; }
    };
    try {
      session = this.sessions.require(sessionId);
      this.trace.outboundMessage(sessionId, message);
      hooks?.prepare();
      raw = JSON.stringify(message);
      if (hooks) { session = ready();
        hooks.admit(session);
        session = ready(); }
      session.outbound.push(message);
      queued = session;
      hooks?.invoking();
    } catch (error) {
      if (queued) { const index = queued.outbound.lastIndexOf(message);
        if (index >= 0) queued.outbound.splice(index, 1); }
      hooks?.refuse(error);
      throw error;
    }
    await session.socket?.send(raw);
  }
  /** Durable admission: a real ready owner/socket is required before any enqueue or send. */
  async sendChecked(sessionId: string, clientId: string, message: ClientGatewayServerMessage, hooks?: {
    admit(session: InternalSession | null): void;
    prepare(): void;
    invoking(): void;
    refuse(error: unknown): never;
  }): Promise<void> {
    const ready = (): InternalSession => {
      try { return this.sessions.requireReady(sessionId); }
      catch (error) { hooks?.admit(null);
        throw error; }
    };
    let session: InternalSession, raw: string, queued: InternalSession | undefined;
    try {
      session = ready();
      hooks?.admit(session);
      session = ready();
      if (session.clientId !== clientId || !session.socket) throw new Error("durable_command.socket_unavailable");
      this.trace.outboundMessage(sessionId, message);
      hooks?.prepare();
      raw = JSON.stringify(message);
      // Trace sinks and injected timers can synchronously release/revoke/Stop.
      // Re-resolve after all that preparation, before any executable queue entry.
      session = ready();
      hooks?.admit(session);
      session = ready();
      if (session.clientId !== clientId || !session.socket) throw new Error("durable_command.socket_unavailable");
      session.outbound.push(message);
      queued = session;
      hooks?.invoking();
    } catch (error) {
      if (queued) { const index = queued.outbound.lastIndexOf(message);
        if (index >= 0) queued.outbound.splice(index, 1); }
      hooks?.refuse(error);
      throw error;
    }
    // A socket may have acted before throwing/rejecting. Only this invocation
    // crosses the uncertainty boundary; preparation failures above never do.
    await session.socket!.send(raw);
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
    this.trace.outboundMessage(session.sessionId, message);
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

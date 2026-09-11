import type { ClientGatewayClientHello, ClientGatewaySession, ClientGatewaySocket } from "@fluxiq/contracts/client-gateway";
import type { ClientGatewayAuditLog } from "./audit-log.ts";
import type { ClientGatewayConfig } from "./config.ts";
import type { ClientGatewayEventBus } from "./event-bus.ts";
import type { ClientGatewayPairingFlow } from "./pairing-flow.ts";
import type { ClientGatewaySessionRegistry } from "./sessions.ts";
import type { ClientGatewayTransport } from "./transport.ts";
import type { ClientGatewayTrustedClientRegistry } from "./trusted-clients.ts";
import type { InternalSession } from "./types.ts";

import type { ClientGatewayFacadePorts } from "./facade-ports.ts";

type LifecycleCollaborators = {
  config: ClientGatewayConfig;
  sessions: ClientGatewaySessionRegistry;
  trustedClients: ClientGatewayTrustedClientRegistry;
  transport: ClientGatewayTransport;
  audit: ClientGatewayAuditLog;
  events: ClientGatewayEventBus;
  pairingFlow: ClientGatewayPairingFlow;
  // Calls into the service's public surface go through this port, never
  // through the collaborator that owns the method. See ./facade-ports.ts.
  facade: ClientGatewayFacadePorts;
};

/**
 * Connect, hello, and disconnect. These three are one collaborator because
 * connect starts the hello handshake and the handshake disconnects the sessions
 * a reconnecting client replaces, so splitting them would only make a cycle.
 */
export class ClientGatewayLifecycle {
  private readonly config: ClientGatewayConfig;
  private readonly sessions: ClientGatewaySessionRegistry;
  private readonly trustedClients: ClientGatewayTrustedClientRegistry;
  private readonly transport: ClientGatewayTransport;
  private readonly audit: ClientGatewayAuditLog;
  private readonly events: ClientGatewayEventBus;
  private readonly pairingFlow: ClientGatewayPairingFlow;
  private readonly facade: ClientGatewayFacadePorts;

  constructor(collaborators: LifecycleCollaborators) {
    this.config = collaborators.config;
    this.sessions = collaborators.sessions;
    this.trustedClients = collaborators.trustedClients;
    this.transport = collaborators.transport;
    this.audit = collaborators.audit;
    this.events = collaborators.events;
    this.pairingFlow = collaborators.pairingFlow;
    this.facade = collaborators.facade;
  }

  connect(input: { socket?: ClientGatewaySocket; hello?: ClientGatewayClientHello } = {}): ClientGatewaySession {
    const session = this.sessions.create(input);
    this.audit.record("session.connected", "Client connected.", { sessionId: session.sessionId, clientId: session.clientId });
    if (input.hello) void this.handleHello(session.sessionId, input.hello);
    return this.sessions.toPublic(session);
  }

  disconnect(sessionId: string, reason = "disconnected"): ClientGatewaySession | null {
    const session = this.sessions.get(sessionId);
    if (!session) return null;
    const next: InternalSession = { ...session, status: "disconnected", disconnectedAt: this.config.now(), lastSeenAt: this.config.now() };
    this.sessions.replace(sessionId, next);
    void next.socket?.close?.(1000, reason);
    this.audit.record("session.disconnected", "Client disconnected.", { sessionId, reason });
    void this.events.emit({ type: "session.disconnected", session: this.sessions.toPublic(next) });
    return this.sessions.toPublic(next);
  }

  async handleHello(sessionId: string, hello: ClientGatewayClientHello): Promise<void> {
    await this.facade.ready();
    const session = this.sessions.require(sessionId);
    this.applyHello(session, hello);
    if (hello.token && await this.resumeTrustedSession(session, hello.token)) return;
    session.status = "pairing_required";
    const pairing = this.pairingFlow.ensureForSession(session);
    await this.transport.send(sessionId, this.transport.message("server.pairing_required", {
      referenceCode: pairing.referenceCode ?? pairing.pairingCode,
      reason: "Approve this client in FluxIQ before sending data."
    }, session));
  }

  private applyHello(session: InternalSession, hello: ClientGatewayClientHello): void {
    session.clientId = hello.clientId ?? session.clientId;
    session.clientType = hello.clientType;
    session.name = hello.name ?? session.name;
    if (hello.version !== undefined) session.version = hello.version;
    session.capabilities = hello.capabilities ?? session.capabilities;
    if (hello.metadata !== undefined) session.metadata = hello.metadata;
  }

  /**
   * Accept a returning client's bearer token: rotate its credential, drop the
   * older session it replaces, and mark this one ready. `false` means the token
   * was not accepted and the caller must fall back to pairing.
   */
  private async resumeTrustedSession(session: InternalSession, token: string): Promise<boolean> {
    const trustedClient = this.trustedClients.resolveByToken(token);
    if (!trustedClient || !this.trustedClients.isActive(trustedClient) || trustedClient.clientId !== session.clientId) {
      this.audit.record("session.credential_rejected", "Client credential was not accepted; pairing is required.", {
        sessionId: session.sessionId,
        clientId: session.clientId
      });
      return false;
    }
    const rotatedToken = await this.trustedClients.rotateToken(trustedClient);
    for (const existing of this.sessions.listReadyByTrustedClient(trustedClient.trustedClientId)) {
      if (existing.sessionId === session.sessionId) continue;
      await this.transport.send(existing.sessionId, this.transport.message("server.disconnect", { reason: "Client reconnected in a newer session." }, existing));
      this.disconnect(existing.sessionId, "replaced by newer session");
    }
    this.sessions.attachTrustedClient(session, trustedClient);
    await this.transport.send(session.sessionId, this.transport.message("server.session_ready", {
      sessionId: session.sessionId,
      token: rotatedToken,
      ...(session.projectId !== undefined ? { projectId: session.projectId } : {})
    }, session));
    this.audit.record("session.reconnected", "Trusted client reconnected and its credential was rotated.", {
      sessionId: session.sessionId,
      trustedClientId: trustedClient.trustedClientId,
      clientId: session.clientId
    });
    await this.events.emit({ type: "session.ready", session: this.sessions.toPublic(session) });
    return true;
  }
}

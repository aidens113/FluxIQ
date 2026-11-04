import type { ClientGatewayClientHello, ClientGatewayPairingChallenge, ClientGatewaySession, ClientGatewaySocket } from "@fluxiq/contracts/client-gateway";
import type { ClientGatewayAuditLog } from "./audit-log.ts";
import type { ClientGatewayCredentialCustodian, ClientGatewayCredentialHolder } from "./credential-custody.ts";
import { ClientGatewayPairingCapacityError, clientGatewayPeerAuditFields, type ClientGatewayPeer } from "./security/index.ts";
import type { ClientGatewayConfig } from "./config.ts";
import { declaredDomainId } from "./declared-domain.ts";
import type { ClientGatewayEventBus } from "./event-bus.ts";
import type { ClientGatewayPairingFlow } from "./pairing-flow.ts";
import type { ClientGatewaySessionRegistry } from "./sessions.ts";
import type { ClientGatewayTransport } from "./transport.ts";
import type { ClientGatewayTrustedClientRegistry } from "./trusted-clients.ts";
import type { InternalSession } from "./types.ts";
import type { ClientGatewayTraceTap } from "./trace-tap/index.ts";

import type { ClientGatewayFacadePorts } from "./facade-ports.ts";

type LifecycleCollaborators = {
  config: ClientGatewayConfig;
  sessions: ClientGatewaySessionRegistry;
  trustedClients: ClientGatewayTrustedClientRegistry;
  transport: ClientGatewayTransport;
  audit: ClientGatewayAuditLog;
  events: ClientGatewayEventBus;
  pairingFlow: ClientGatewayPairingFlow;
  trace: ClientGatewayTraceTap;
  // Calls into the service's public surface go through this port, never
  // through the collaborator that owns the method. See ./facade-ports.ts.
  facade: ClientGatewayFacadePorts;
  custody: ClientGatewayCredentialCustodian;
};

/** The holder custody knows a trusted client by. */
export function clientGatewayCredentialHolder(client: { trustedClientId: string; approvedByUserId: string; expiresAt: number; name: string }): ClientGatewayCredentialHolder {
  return { trustedClientId: client.trustedClientId, userId: client.approvedByUserId, expiresAtMs: client.expiresAt, name: client.name };
}

/** The reason an older session of a reconnecting client is closed for. */
const SESSION_REPLACED = "replaced by newer session";

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
  private readonly trace: ClientGatewayTraceTap;
  private readonly custody: ClientGatewayCredentialCustodian;

  constructor(collaborators: LifecycleCollaborators) {
    this.config = collaborators.config;
    this.sessions = collaborators.sessions;
    this.trustedClients = collaborators.trustedClients;
    this.transport = collaborators.transport;
    this.audit = collaborators.audit;
    this.events = collaborators.events;
    this.pairingFlow = collaborators.pairingFlow;
    this.facade = collaborators.facade;
    this.trace = collaborators.trace;
    this.custody = collaborators.custody;
  }

  connect(input: { socket?: ClientGatewaySocket; hello?: ClientGatewayClientHello; peer?: ClientGatewayPeer } = {}): ClientGatewaySession {
    const session = this.sessions.create(input);
    this.audit.record("session.connected", "Client connected.", { sessionId: session.sessionId, clientId: session.clientId, ...clientGatewayPeerAuditFields(session.peer) });
    // A hello handed over with the connection goes to the traces claiming its client, its token redacted (D7).
    this.trace.lifecycle({ sessionId: session.sessionId, clientId: session.clientId }, "session.connected", { hello: input.hello ?? null }, [["hello", "token"]]);
    if (input.hello) void this.handleHello(session.sessionId, input.hello);
    return this.sessions.toPublic(session);
  }

  /**
   * A session attached under a channel scope (`./channel-scope/`): ready at
   * once, because no person pairs a recorded or scripted client, and never
   * written to the trusted-client store, because nothing about it is trusted
   * beyond the scope. Its client id is always minted here, whatever the hello
   * claims, so it can never share a live client's id: a live client's
   * reconnect, a reconcile question or a durable answer addressed by client id
   * can never reach it, nor it them. Its token is ignored. No `session.ready`
   * is emitted, so no listener outside the scope learns it exists.
   */
  attachScoped(input: { scopeId: string; socket: ClientGatewaySocket; hello: ClientGatewayClientHello }): ClientGatewaySession {
    if (typeof input.scopeId !== "string" || !input.scopeId) throw new Error("client_gateway.channel_scope_required");
    const hello: ClientGatewayClientHello = { clientId: `client.scoped.${this.config.createId("client")}`, clientType: input.hello.clientType };
    if (input.hello.name !== undefined) hello.name = input.hello.name;
    if (input.hello.version !== undefined) hello.version = input.hello.version;
    if (input.hello.capabilities !== undefined) hello.capabilities = input.hello.capabilities;
    if (input.hello.metadata !== undefined) hello.metadata = input.hello.metadata;
    const session = this.sessions.create({ socket: input.socket, hello });
    session.status = "ready";
    session.channelScope = input.scopeId;
    this.audit.record("session.scoped_attached", "A session was attached under a channel scope; it is reachable only from inside that scope.", { sessionId: session.sessionId, clientId: session.clientId, channelScope: input.scopeId });
    return this.sessions.toPublic(session);
  }

  /** A client says it stored the credential it was last sent: the one before it ends now. */
  async credentialReceived(session: InternalSession): Promise<void> {
    const trustedClient = session.trustedClientId ? this.trustedClients.get(session.trustedClientId) : undefined;
    if (!trustedClient || !this.trustedClients.isActive(trustedClient)) return;
    if (await this.trustedClients.confirmCurrent(trustedClient)) await this.custody.confirmed({ holder: clientGatewayCredentialHolder(trustedClient) });
  }

  /** The trusted client a session is paired as. */
  trustedClientIdOf(sessionId: string): string | undefined {
    return this.sessions.get(sessionId)?.trustedClientId;
  }

  /** Whether `sessionId` was attached under a channel scope; false for a live or unknown session. */
  isScoped(sessionId: string): boolean {
    return this.sessions.get(sessionId)?.channelScope !== undefined;
  }

  disconnect(sessionId: string, reason = "disconnected"): ClientGatewaySession | null {
    const session = this.sessions.get(sessionId);
    if (!session) return null;
    const next: InternalSession = { ...session, status: "disconnected", disconnectedAt: this.config.now(), lastSeenAt: this.config.now() };
    delete next.pendingPairingCode;
    this.sessions.replace(sessionId, next);
    // A pairing the person has not approved yet can no longer reach this
    // browser; it reconnects in a new session that asks with a new code.
    this.pairingFlow.withdrawForSession(sessionId, reason);
    void next.socket?.close?.(1000, reason);
    this.audit.record("session.disconnected", "Client disconnected.", { sessionId, reason });
    this.trace.lifecycle({ sessionId, clientId: next.clientId }, "session.disconnected", { reason });
    void this.events.emit({ type: "session.disconnected", session: this.sessions.toPublic(next) });
    // What custody holds in memory for this client goes with its last socket, and its credential brings it back. A session a reconnect is replacing is not the last.
    if (next.trustedClientId && reason !== SESSION_REPLACED && !this.sessions.findReadyByTrustedClient(next.trustedClientId)) this.custody.released(next.trustedClientId);
    return this.sessions.toPublic(next);
  }

  async handleHello(sessionId: string, hello: ClientGatewayClientHello): Promise<void> {
    await this.facade.ready();
    const session = this.sessions.require(sessionId);
    this.applyHello(session, hello);
    if (hello.token && await this.resumeTrustedSession(session, hello.token)) return;
    session.status = "pairing_required";
    let pairing: ClientGatewayPairingChallenge;
    try {
      pairing = this.pairingFlow.ensureForSession(session);
    } catch (error) {
      if (!(error instanceof ClientGatewayPairingCapacityError)) throw error;
      await this.refuseOverCapacity(session, error);
      return;
    }
    await this.transport.send(sessionId, this.transport.message("server.pairing_required", {
      referenceCode: pairing.referenceCode ?? pairing.pairingCode,
      reason: "Approve this client in FluxIQ before sending data."
    }, session));
  }

  /**
   * No pairing code could be offered because too many are waiting
   * (`pairing.refused_capacity`, audited by the pairing flow). The client is
   * told why with the error's code and the session is closed, as a refused
   * protocol version is, so an unpaired socket does not sit open waiting.
   */
  private async refuseOverCapacity(session: InternalSession, error: ClientGatewayPairingCapacityError): Promise<void> {
    await this.transport.send(session.sessionId, this.transport.message("server.error", { code: error.code, message: error.message }, session));
    await this.transport.send(session.sessionId, this.transport.message("server.disconnect", { reason: error.message }, session));
    this.facade.disconnect(session.sessionId, "pairing capacity reached");
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
    // The trust was approved for the domain the client declared then. A
    // connection declaring another one, or trust minted before the domain was
    // bound, goes back through pairing: a person approves it again or not.
    const declared = declaredDomainId(session.metadata);
    if (trustedClient.domainId === undefined || trustedClient.domainId !== declared) {
      this.audit.record("session.domain_rejected", "Client declared a domain its trust was not approved for; pairing is required.", {
        sessionId: session.sessionId,
        clientId: session.clientId,
        boundDomainId: trustedClient.domainId ?? null,
        declaredDomainId: declared
      });
      return false;
    }
    const holder = clientGatewayCredentialHolder(trustedClient);
    // A client with its current credential has it confirmed; one with the credential before has not received what it was last sent.
    if (this.trustedClients.isCurrentToken(trustedClient, token)) await this.custody.confirmed({ holder, credential: token });
    const rotatedToken = await this.trustedClients.rotateToken(trustedClient, token, (nextCredential) => this.custody.rotating({ holder, previousCredential: token, nextCredential }));
    for (const existing of this.sessions.listReadyByTrustedClient(trustedClient.trustedClientId)) {
      if (existing.sessionId === session.sessionId) continue;
      await this.transport.send(existing.sessionId, this.transport.message("server.disconnect", { reason: "Client reconnected in a newer session." }, existing));
      this.disconnect(existing.sessionId, SESSION_REPLACED);
      this.audit.record("session.replaced", "A trusted client reconnected in a newer session; the older session was closed.", {
        sessionId: existing.sessionId,
        replacedBySessionId: session.sessionId,
        trustedClientId: trustedClient.trustedClientId,
        clientId: session.clientId,
        ...clientGatewayPeerAuditFields(session.peer)
      });
    }
    this.sessions.attachTrustedClient(session, trustedClient);
    // Before the client is told it is ready, so its first request finds its key.
    await this.custody.presented({ holder: clientGatewayCredentialHolder(trustedClient), credential: rotatedToken });
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

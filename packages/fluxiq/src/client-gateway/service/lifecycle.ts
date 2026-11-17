import type { ClientGatewayClientHello, ClientGatewayPairingChallenge, ClientGatewaySession, ClientGatewaySocket, ClientGatewayTrustedClient } from "@fluxiq/contracts/client-gateway";
import type { ClientGatewayAuditLog } from "./audit-log.ts";
import type { ClientGatewayCredentialCustodian, ClientGatewayCredentialHolder } from "./credential-custody.ts";
import { ClientGatewayPairingCapacityError, clientGatewayPeerAuditFields, type ClientGatewayPeer } from "./security/index.ts";
import type { ClientGatewayConfig } from "./config.ts";
import { declaredDomainId } from "./declared-domain.ts";
import type { ClientGatewayHostEnrolment } from "./enrolment/index.ts";
import type { ClientGatewayEventBus } from "./event-bus.ts";
import type { ClientGatewayPairingFlow } from "./pairing-flow.ts";
import type { ClientGatewaySessionRegistry } from "./sessions.ts";
import type { ClientGatewayTransport } from "./transport.ts";
import { ClientGatewayTrustEndedError } from "./trust-ended-error.ts";
import type { ClientGatewayTrustedClientRegistry } from "./trusted-clients.ts";
import type { InternalSession } from "./types.ts";
import type { ClientGatewayTraceTap } from "./trace-tap/index.ts";
import { ClientGatewaySessionMetadataUnavailableError, type ClientGatewaySessionMetadataResolver } from "./session-metadata/index.ts";

import type { ClientGatewayFacadePorts } from "./facade-ports.ts";

type LifecycleCollaborators = {
  config: ClientGatewayConfig;
  sessions: ClientGatewaySessionRegistry;
  trustedClients: ClientGatewayTrustedClientRegistry;
  transport: ClientGatewayTransport;
  audit: ClientGatewayAuditLog;
  events: ClientGatewayEventBus;
  pairingFlow: ClientGatewayPairingFlow;
  enrolment: ClientGatewayHostEnrolment;
  trace: ClientGatewayTraceTap;
  // Calls into the service's public surface go through this port, never
  // through the collaborator that owns the method. See ./facade-ports.ts.
  facade: ClientGatewayFacadePorts;
  custody: ClientGatewayCredentialCustodian;
  sessionMetadata: ClientGatewaySessionMetadataResolver;
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
  private readonly enrolment: ClientGatewayHostEnrolment;
  private readonly facade: ClientGatewayFacadePorts;
  private readonly trace: ClientGatewayTraceTap;
  private readonly custody: ClientGatewayCredentialCustodian;
  private readonly sessionMetadata: ClientGatewaySessionMetadataResolver;

  constructor(collaborators: LifecycleCollaborators) {
    this.config = collaborators.config;
    this.sessions = collaborators.sessions;
    this.trustedClients = collaborators.trustedClients;
    this.transport = collaborators.transport;
    this.audit = collaborators.audit;
    this.events = collaborators.events;
    this.pairingFlow = collaborators.pairingFlow;
    this.enrolment = collaborators.enrolment;
    this.facade = collaborators.facade;
    this.trace = collaborators.trace;
    this.custody = collaborators.custody;
    this.sessionMetadata = collaborators.sessionMetadata;
  }

  connect(input: { socket?: ClientGatewaySocket; hello?: ClientGatewayClientHello; peer?: ClientGatewayPeer } = {}): ClientGatewaySession {
    const session = this.sessions.create(input);
    this.audit.record("session.connected", "Client connected.", { sessionId: session.sessionId, clientId: session.clientId, ...clientGatewayPeerAuditFields(session.peer) });
    // A hello handed over with the connection goes to the traces claiming its client, its token and any enrolment ticket redacted (D7).
    this.trace.lifecycle({ sessionId: session.sessionId, clientId: session.clientId }, "session.connected", { hello: input.hello ?? null }, [["hello", "token"], ["hello", "enrolmentTicket"]]);
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
    // Only for the credential this session was sent: a concurrent reconnect's is not this client's to confirm.
    if (session.sentCredentialHash !== trustedClient.tokenHash) return;
    if (await this.trustedClients.confirmCurrent(trustedClient)) await this.custody.confirmed({ holder: clientGatewayCredentialHolder(trustedClient), credentialDigest: trustedClient.tokenHash });
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
    if (session.disconnectedAt !== undefined || session.status === "disconnected") return;
    this.applyHello(session, hello);
    // A managed host the engine launched is enrolled by its ticket or refused and closed; it never pairs.
    if (hello.enrolmentTicket !== undefined) {
      await this.enrolment.enrol(session, hello.enrolmentTicket);
      return;
    }
    if (hello.token && await this.resumeTrustedSession(session, hello.token)) return;
    if (this.sessions.get(sessionId) !== session || session.disconnectedAt !== undefined) return;
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
    await this.refuseReuse(token);
    const trustedClient = this.trustedClients.resolveByToken(token);
    if (!trustedClient || !this.trustedClients.isActive(trustedClient) || trustedClient.clientId !== session.clientId || trustedClient.clientType !== session.clientType) {
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
    const binding = this.sessionMetadata.capture(session, trustedClient);
    try {
      const initial = await this.sessionMetadata.resolve(binding, token, false);
      const holder = clientGatewayCredentialHolder(trustedClient);
      // Current confirms receipt; previous still follows the existing lost-reply recovery path.
      if (this.trustedClients.isCurrentToken(trustedClient, token)) await this.custody.confirmed({ holder, credentialDigest: initial.tokenHash });
      this.sessionMetadata.assert(binding, initial.tokenHash);
      const rotatedToken = await this.trustedClients.rotateToken(trustedClient, token, async (nextCredential) => {
        await this.custody.rotating({ holder, previousCredential: token, nextCredential });
        this.sessionMetadata.assert(binding, initial.tokenHash);
      });
      const tokenHash = this.trustedClients.hashToken(rotatedToken);
      this.sessionMetadata.assert(binding, tokenHash);
      await this.custody.presented({ holder: clientGatewayCredentialHolder(trustedClient), credential: rotatedToken });
      this.sessionMetadata.assert(binding, tokenHash);
      for (const existing of this.sessions.listReadyByTrustedClient(trustedClient.trustedClientId)) {
        if (existing.sessionId === session.sessionId) continue;
        await this.transport.send(existing.sessionId, this.transport.message("server.disconnect", { reason: "Client reconnected in a newer session." }, existing));
        this.sessionMetadata.assert(binding, tokenHash);
        this.disconnect(existing.sessionId, SESSION_REPLACED);
        this.audit.record("session.replaced", "A trusted client reconnected in a newer session; the older session was closed.", {
          sessionId: existing.sessionId, replacedBySessionId: session.sessionId,
          trustedClientId: trustedClient.trustedClientId, clientId: session.clientId,
          ...clientGatewayPeerAuditFields(session.peer)
        });
      }
      const current = await this.sessionMetadata.resolve(binding, rotatedToken, true);
      this.sessionMetadata.assert(binding, tokenHash);
      this.sessions.attachTrustedClient(session, trustedClient);
      // What a `client.focus_project` of null returns to (`./project-focus/`): a reconnect binds no project.
      session.pairedProjectId = session.projectId ?? null;
      session.sentCredentialHash = tokenHash;
      await this.transport.send(session.sessionId, this.transport.message("server.session_ready", {
        sessionId: session.sessionId, token: rotatedToken,
        ...(session.projectId !== undefined ? { projectId: session.projectId } : {}),
        ...current.fields
      }, session));
      if (!this.sessionMetadata.current(binding, tokenHash)) return true;
      this.audit.record("session.reconnected", "Trusted client reconnected and its credential was rotated.", {
        sessionId: session.sessionId, trustedClientId: trustedClient.trustedClientId, clientId: session.clientId
      });
      await this.events.emit({ type: "session.ready", session: this.sessions.toPublic(session) });
      return true;
    } catch (error) {
      if (error instanceof ClientGatewaySessionMetadataUnavailableError) {
        await this.sessionMetadata.refuse(session);
        return true;
      }
      if (error instanceof ClientGatewayTrustEndedError) {
        if (this.sessions.get(session.sessionId) !== session || session.disconnectedAt !== undefined) return true;
        return await this.refuseEndedTrust(session, trustedClient);
      }
      throw error;
    }
  }

  /** A credential this client moved past was presented: only someone holding a copy can, so its trust ends, and the real browser pairs again. */
  async refuseReuse(token: string, options: { request?: boolean } = {}): Promise<void> {
    const reused = this.trustedClients.reuseOf(token, options);
    if (!reused) return;
    this.audit.record("credential.reuse_detected", "A retired credential was presented, so this client's trust was revoked.", { trustedClientId: reused.trustedClientId, clientId: reused.clientId });
    await this.facade.revokeTrustedClient(reused.trustedClientId, "credential reuse detected");
  }

  /** The trust ended while this reconnect was in flight: what custody keeps goes, and the session asks to pair. */
  private async refuseEndedTrust(session: InternalSession, trustedClient: ClientGatewayTrustedClient): Promise<false> {
    await this.custody.forgotten(trustedClient.trustedClientId);
    this.audit.record("session.credential_rejected", "A reconnect's trust ended while it was in flight; pairing is required.", { sessionId: session.sessionId, clientId: session.clientId, trustedClientId: trustedClient.trustedClientId });
    return false;
  }
}

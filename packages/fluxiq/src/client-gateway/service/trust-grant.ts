import type { ClientGatewayManagedHost, ClientGatewaySession, ClientGatewayTrustedClient } from "@fluxiq/contracts/client-gateway";
import type { JsonObject } from "../../core/index.ts";
import type { ClientGatewayAuditLog } from "./audit-log.ts";
import type { ClientGatewayCredentialCustodian } from "./credential-custody.ts";
import { declaredDomainId } from "./declared-domain.ts";
import type { ClientGatewayEventBus } from "./event-bus.ts";
import type { ClientGatewayFacadePorts } from "./facade-ports.ts";
import { clientGatewayCredentialHolder } from "./lifecycle.ts";
import type { ClientGatewaySessionRegistry } from "./sessions.ts";
import type { ClientGatewayTraceTap } from "./trace-tap/index.ts";
import type { ClientGatewayTransport } from "./transport.ts";
import type { ClientGatewayTrustedClientRegistry } from "./trusted-clients.ts";
import type { InternalSession } from "./types.ts";

type TrustGrantCollaborators = {
  sessions: ClientGatewaySessionRegistry;
  trustedClients: ClientGatewayTrustedClientRegistry;
  transport: ClientGatewayTransport;
  audit: ClientGatewayAuditLog;
  events: ClientGatewayEventBus;
  trace: ClientGatewayTraceTap;
  // Calls into the service's public surface go through this port, never
  // through the collaborator that owns the method. See ./facade-ports.ts.
  facade: ClientGatewayFacadePorts;
  custody: ClientGatewayCredentialCustodian;
};

/** What one grant needs from the path that decided it: a person's approval of a pairing, or a redeemed enrolment ticket. */
export type ClientGatewayTrustGrantRequest = {
  /** The session waiting for this trust. */
  session: InternalSession;
  /** Who the trust acts for: the person who approved it, or the managed-host principal. */
  approvedByUserId: string;
  approvedBySessionId?: string | undefined;
  /** The managed host an enrolment ticket was bound to; absent for a pairing. */
  managedHost?: ClientGatewayManagedHost;
  /** The project the session is bound to, when the path names one. */
  projectId?: string | null;
  /**
   * Why the session can no longer take this trust, read after the trust was
   * saved, or nothing when it still waits. The trust is taken back and this is
   * thrown.
   */
  lateRefusal(): Error | undefined;
  /** What the trust taken back for a late refusal is recorded as revoked for. */
  lateRevocationReason: string;
  /** The path's own bookkeeping, once the trust stands and before the session is marked ready. */
  bind?(trustedClient: ClientGatewayTrustedClient): void;
  /** The lifecycle event the session's traces record, and its detail. */
  traceEvent: string;
  traceDetail(trustedClient: ClientGatewayTrustedClient): Record<string, unknown>;
  /** The audit entry the grant is recorded as; never a credential. */
  audit: { type: string; message: string; metadata(trustedClient: ClientGatewayTrustedClient): JsonObject };
};

/**
 * Granting durable trust to a session that is waiting for it: the one path a
 * pairing a person approved and a managed host's redeemed enrolment ticket
 * both take, so the two can never drift apart. It saves the trust, takes it
 * back if the session stopped waiting meanwhile, ends this client's earlier
 * trust from the same approver, tells custody before the credential leaves,
 * and sends the session its one-time token.
 */
export class ClientGatewayTrustGrant {
  private readonly sessions: ClientGatewaySessionRegistry;
  private readonly trustedClients: ClientGatewayTrustedClientRegistry;
  private readonly transport: ClientGatewayTransport;
  private readonly audit: ClientGatewayAuditLog;
  private readonly events: ClientGatewayEventBus;
  private readonly trace: ClientGatewayTraceTap;
  private readonly facade: ClientGatewayFacadePorts;
  private readonly custody: ClientGatewayCredentialCustodian;

  constructor(collaborators: TrustGrantCollaborators) {
    this.sessions = collaborators.sessions;
    this.trustedClients = collaborators.trustedClients;
    this.transport = collaborators.transport;
    this.audit = collaborators.audit;
    this.events = collaborators.events;
    this.trace = collaborators.trace;
    this.facade = collaborators.facade;
    this.custody = collaborators.custody;
  }

  async grant(request: ClientGatewayTrustGrantRequest): Promise<ClientGatewaySession> {
    const { session } = request;
    const { sessionId } = session;
    const { trustedClient, token } = await this.trustedClients.register({
      clientId: session.clientId,
      clientType: session.clientType,
      name: session.name,
      approvedByUserId: request.approvedByUserId,
      // The domain the client declared when the trust was decided.
      domainId: declaredDomainId(session.metadata),
      ...(request.managedHost !== undefined ? { managedHost: request.managedHost } : {})
    });
    // Saving the trust is asynchronous, and the client can leave meanwhile.
    // Trust for a session that is no longer waiting would hand its one-time
    // token to a closed socket, so take the trust back and say so.
    const lateRefusal = request.lateRefusal();
    if (lateRefusal) {
      await this.trustedClients.revoke(trustedClient, request.lateRevocationReason);
      throw lateRefusal;
    }
    await this.endEarlierTrust(trustedClient);
    const now = trustedClient.approvedAt;
    request.bind?.(trustedClient);
    this.sessions.attachTrustedClient(session, trustedClient);
    if (request.projectId !== undefined) session.projectId = request.projectId;
    session.pairedAt = now;
    this.trace.lifecycle({ sessionId, clientId: session.clientId }, request.traceEvent, request.traceDetail(trustedClient));
    // Before the token leaves: this client's first request finds what its approver can open.
    await this.custody.issued({ holder: clientGatewayCredentialHolder(trustedClient), credential: token, approvedBySessionId: request.approvedBySessionId });
    session.sentCredentialHash = this.trustedClients.hashToken(token);
    await this.transport.send(sessionId, this.transport.message("server.session_ready", {
      sessionId,
      token,
      ...(request.projectId !== undefined ? { projectId: request.projectId } : {})
    }, session));
    this.audit.recordSecurity(request.audit.type, request.audit.message, request.audit.metadata(trustedClient));
    await this.events.emit({ type: "session.ready", session: this.sessions.toPublic(session) });
    return this.sessions.toPublic(session);
  }

  /**
   * This client id was granted trust again by the same approver, so a trust they gave it before
   * is not this client's any more, and anyone still holding its credential is out. Only their own:
   * a client id is whatever a client says, so nobody ends another person's trust by saying theirs.
   */
  private async endEarlierTrust(granted: ClientGatewayTrustedClient): Promise<void> {
    for (const earlier of this.trustedClients.list()) {
      if (earlier.trustedClientId === granted.trustedClientId || earlier.clientId !== granted.clientId || earlier.approvedByUserId !== granted.approvedByUserId || !this.trustedClients.isActive(earlier)) continue;
      try {
        await this.facade.revokeTrustedClient(earlier.trustedClientId, "the same browser was approved again");
      } catch (error) {
        this.audit.record("trust.revoke_failed", "An earlier trust of a browser approved again could not be ended; it still ends on any copy of its credential being used.", { trustedClientId: earlier.trustedClientId, error: error instanceof Error ? error.name : "unknown" });
      }
    }
  }
}

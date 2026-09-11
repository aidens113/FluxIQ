import type { ClientGatewayPairingChallenge, ClientGatewaySession } from "@fluxiq/contracts/client-gateway";
import type { ClientGatewayAuditLog } from "./audit-log.ts";
import type { ClientGatewayConfig } from "./config.ts";
import type { ClientGatewayEventBus } from "./event-bus.ts";
import type { ClientGatewayPairingRegistry } from "./pairings.ts";
import type { ClientGatewaySessionRegistry } from "./sessions.ts";
import type { ClientGatewayTransport } from "./transport.ts";
import type { ClientGatewayTrustedClientRegistry } from "./trusted-clients.ts";
import type { InternalSession } from "./types.ts";

import type { ClientGatewayFacadePorts } from "./facade-ports.ts";

type PairingFlowCollaborators = {
  config: ClientGatewayConfig;
  pairings: ClientGatewayPairingRegistry;
  sessions: ClientGatewaySessionRegistry;
  trustedClients: ClientGatewayTrustedClientRegistry;
  transport: ClientGatewayTransport;
  audit: ClientGatewayAuditLog;
  events: ClientGatewayEventBus;
  // Calls into the service's public surface go through this port, never
  // through the collaborator that owns the method. See ./facade-ports.ts.
  facade: ClientGatewayFacadePorts;
};

/**
 * Turning a pairing challenge into durable trust. This is the one place that
 * spans the pairing registry, the session registry and the trusted-client
 * registry at once, so the whole approval sequence lives here rather than being
 * split across the three stores it touches.
 */
export class ClientGatewayPairingFlow {
  private readonly config: ClientGatewayConfig;
  private readonly pairings: ClientGatewayPairingRegistry;
  private readonly sessions: ClientGatewaySessionRegistry;
  private readonly trustedClients: ClientGatewayTrustedClientRegistry;
  private readonly transport: ClientGatewayTransport;
  private readonly audit: ClientGatewayAuditLog;
  private readonly events: ClientGatewayEventBus;
  private readonly facade: ClientGatewayFacadePorts;

  constructor(collaborators: PairingFlowCollaborators) {
    this.config = collaborators.config;
    this.pairings = collaborators.pairings;
    this.sessions = collaborators.sessions;
    this.trustedClients = collaborators.trustedClients;
    this.transport = collaborators.transport;
    this.audit = collaborators.audit;
    this.events = collaborators.events;
    this.facade = collaborators.facade;
  }

  create(input: {
    projectId?: string | null;
    userId?: string;
    ttlMs?: number;
    requestedBySessionId?: string;
    requestedByClientId?: string;
    requestedByClientName?: string;
  } = {}): ClientGatewayPairingChallenge {
    const pairing = this.pairings.create(input);
    this.audit.record("pairing.created", "Client pairing challenge created.", {
      pairingCode: pairing.pairingCode,
      projectId: input.projectId ?? null
    });
    return pairing;
  }

  async approve(pairingCode: string, input: { approvedByUserId: string }): Promise<ClientGatewaySession | null> {
    await this.facade.ready();
    this.pairings.pruneExpired();
    const pairing = this.pairings.get(pairingCode);
    if (!pairing || pairing.consumedAt || !pairing.requestedBySessionId) return null;
    const approvedByUserId = input.approvedByUserId.trim();
    if (!approvedByUserId) throw new Error("Approving operator is required.");
    return this.complete(pairing.requestedBySessionId, pairingCode, approvedByUserId);
  }

  dismiss(pairingCode: string): boolean {
    const pairing = this.pairings.get(pairingCode);
    if (!pairing) return false;
    this.pairings.delete(pairingCode);
    if (pairing.requestedBySessionId) {
      const session = this.sessions.get(pairing.requestedBySessionId);
      if (session?.pendingPairingCode === pairingCode) delete session.pendingPairingCode;
      if (session && session.status === "pairing_required") {
        void this.transport.send(session.sessionId, this.transport.message("server.error", {
          message: "Client pairing request was rejected in FluxIQ.",
          code: "pairing.rejected"
        }, session));
      }
    }
    this.audit.record("pairing.dismissed", "Client pairing challenge dismissed.", {
      pairingCode,
      sessionId: pairing.requestedBySessionId ?? pairing.sessionId ?? null,
      clientId: pairing.requestedByClientId ?? null
    });
    return true;
  }

  /** The challenge a session is waiting on, reusing an unexpired one if it has it. */
  ensureForSession(session: InternalSession): ClientGatewayPairingChallenge {
    this.pairings.pruneExpired();
    if (session.pendingPairingCode) {
      const existing = this.pairings.get(session.pendingPairingCode);
      if (existing && !existing.consumedAt && existing.expiresAt >= this.config.now()) return existing;
    }
    const pairing = this.create({
      ...(session.projectId !== undefined ? { projectId: session.projectId } : {}),
      requestedBySessionId: session.sessionId,
      requestedByClientId: session.clientId,
      requestedByClientName: session.name
    });
    session.pendingPairingCode = pairing.pairingCode;
    return pairing;
  }

  /** Pairing is operator-approved in FluxIQ; a client cannot approve its own. */
  async rejectClientSubmission(sessionId: string, pairingCode: string): Promise<void> {
    const session = this.sessions.require(sessionId);
    await this.transport.send(sessionId, this.transport.message("server.error", {
      message: "Pairing must be approved by an authenticated operator in FluxIQ.",
      code: "pairing.operator_approval_required"
    }, session));
    this.audit.record("pairing.client_submit_rejected", "Client-side pairing submission was rejected.", { sessionId, pairingCode });
  }

  private async complete(sessionId: string, pairingCode: string, approvedByUserId: string): Promise<ClientGatewaySession | null> {
    this.pairings.pruneExpired();
    const pairing = this.pairings.get(pairingCode);
    const session = this.sessions.get(sessionId);
    if (!pairing || pairing.consumedAt || !session) return null;
    const { trustedClient, token } = await this.trustedClients.register({
      clientId: session.clientId,
      clientType: session.clientType,
      name: session.name,
      approvedByUserId
    });
    const now = trustedClient.approvedAt;
    pairing.consumedAt = now;
    pairing.sessionId = sessionId;
    pairing.userId = approvedByUserId;
    delete session.pendingPairingCode;
    this.pairings.removeOthersForSession(sessionId, pairingCode);
    this.sessions.attachTrustedClient(session, trustedClient);
    if (pairing.projectId !== undefined) session.projectId = pairing.projectId;
    session.pairedAt = now;
    await this.transport.send(sessionId, this.transport.message("server.session_ready", {
      sessionId,
      token,
      ...(pairing.projectId !== undefined ? { projectId: pairing.projectId } : {})
    }, session));
    this.audit.record("session.paired", "Client session paired and durable trust created.", {
      sessionId,
      pairingCode,
      trustedClientId: trustedClient.trustedClientId,
      approvedByUserId,
      projectId: pairing.projectId ?? null
    });
    await this.events.emit({ type: "session.ready", session: this.sessions.toPublic(session) });
    return this.sessions.toPublic(session);
  }
}

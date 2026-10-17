import type { ClientGatewayPairingChallenge, ClientGatewaySession } from "@fluxiq/contracts/client-gateway";
import type { ClientGatewayAuditLog } from "./audit-log.ts";
import type { ClientGatewayConfig } from "./config.ts";
import { declaredDomainId } from "./declared-domain.ts";
import type { ClientGatewayEventBus } from "./event-bus.ts";
import type { ClientGatewayPairingRegistry } from "./pairings.ts";
import type { ClientGatewaySessionRegistry } from "./sessions.ts";
import type { ClientGatewayTransport } from "./transport.ts";
import type { ClientGatewayTrustedClientRegistry } from "./trusted-clients.ts";
import type { InternalSession } from "./types.ts";

import type { ClientGatewayFacadePorts } from "./facade-ports.ts";

/**
 * An approval refused because the client is not waiting for it. `code` is what
 * the web approval route reads to show the person `message` instead of success.
 */
type PairingRefusal = Error & { code: "pairing.client_disconnected" | "pairing.not_waiting" };

const CLIENT_DISCONNECTED = "The browser disconnected before this pairing was approved, so nothing was paired. Reconnect from the browser to get a new code.";
const NOT_WAITING = "This client is no longer waiting for pairing approval, so nothing was paired.";

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
    if (!pairing && this.pairings.withdrawalReason(pairingCode) !== undefined) {
      throw this.refuse(pairingCode, "pairing.client_disconnected", CLIENT_DISCONNECTED);
    }
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

  /**
   * Take back the challenges of a session that went away. Its socket is gone, so
   * a token minted for it now could never arrive and nothing should still offer
   * the challenge for approval.
   */
  withdrawForSession(sessionId: string, reason: string): void {
    for (const pairingCode of this.pairings.withdrawForSession(sessionId, reason)) {
      this.audit.record("pairing.withdrawn", "Client pairing challenge withdrawn because its session ended.", { pairingCode, sessionId, reason });
    }
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
    if (!pairing || pairing.consumedAt) return null;
    const session = this.sessions.get(sessionId);
    if (!session) throw this.refuse(pairingCode, "pairing.client_disconnected", CLIENT_DISCONNECTED);
    const refusal = this.refusalFor(session, pairingCode);
    if (refusal) throw refusal;
    const { trustedClient, token } = await this.trustedClients.register({
      clientId: session.clientId,
      clientType: session.clientType,
      name: session.name,
      approvedByUserId,
      // The domain the person saw this client declare when they approved it.
      domainId: declaredDomainId(session.metadata)
    });
    // Saving the trust is asynchronous, and the browser can leave meanwhile.
    // Trust for a session that is no longer waiting would hand its one-time
    // token to a closed socket, so take the trust back and say so.
    const replaced = this.sessions.get(sessionId) !== session || this.pairings.get(pairingCode) !== pairing;
    const lateRefusal = replaced
      ? this.refuse(pairingCode, "pairing.client_disconnected", CLIENT_DISCONNECTED)
      : this.refusalFor(session, pairingCode) ?? (pairing.consumedAt ? this.refuse(pairingCode, "pairing.not_waiting", NOT_WAITING) : undefined);
    if (lateRefusal) {
      await this.trustedClients.revoke(trustedClient, "pairing session ended before approval completed");
      throw lateRefusal;
    }
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

  /** Why a session cannot take this approval now, or nothing when it is waiting for it. */
  private refusalFor(session: InternalSession, pairingCode: string): PairingRefusal | undefined {
    if (session.status === "disconnected" || session.disconnectedAt !== undefined) {
      return this.refuse(pairingCode, "pairing.client_disconnected", CLIENT_DISCONNECTED);
    }
    if (session.status !== "pairing_required") return this.refuse(pairingCode, "pairing.not_waiting", NOT_WAITING);
    return undefined;
  }

  private refuse(pairingCode: string, code: PairingRefusal["code"], message: string): PairingRefusal {
    this.audit.record("pairing.refused", "Client pairing approval refused; no trust was kept.", { pairingCode, code });
    return Object.assign(new Error(message), { code });
  }
}

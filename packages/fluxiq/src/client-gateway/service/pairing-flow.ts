import type { ClientGatewayPairingChallenge, ClientGatewaySession } from "@fluxiq/contracts/client-gateway";
import type { JsonObject } from "../../core/index.ts";
import type { ClientGatewayAuditLog } from "./audit-log.ts";
import { clientGatewayPeerAuditFields } from "./security/index.ts";
import type { ClientGatewayConfig } from "./config.ts";
import type { ClientGatewayPairingRegistry } from "./pairings.ts";
import type { ClientGatewaySessionRegistry } from "./sessions.ts";
import type { ClientGatewayTransport } from "./transport.ts";
import type { ClientGatewayTrustGrant } from "./trust-grant.ts";
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
  transport: ClientGatewayTransport;
  audit: ClientGatewayAuditLog;
  // Calls into the service's public surface go through this port, never
  // through the collaborator that owns the method. See ./facade-ports.ts.
  facade: ClientGatewayFacadePorts;
  trustGrant: ClientGatewayTrustGrant;
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
  private readonly transport: ClientGatewayTransport;
  private readonly audit: ClientGatewayAuditLog;
  private readonly facade: ClientGatewayFacadePorts;
  private readonly trustGrant: ClientGatewayTrustGrant;

  constructor(collaborators: PairingFlowCollaborators) {
    this.config = collaborators.config;
    this.pairings = collaborators.pairings;
    this.sessions = collaborators.sessions;
    this.transport = collaborators.transport;
    this.audit = collaborators.audit;
    this.facade = collaborators.facade;
    this.trustGrant = collaborators.trustGrant;
  }

  create(input: {
    projectId?: string | null;
    userId?: string;
    ttlMs?: number;
    requestedBySessionId?: string;
    requestedByClientId?: string;
    requestedByClientName?: string;
  } = {}): ClientGatewayPairingChallenge {
    // Over a pending cap the challenge is refused before a code is minted; the caller tells the client.
    const refusal = this.pairings.capacityRefusal(input.requestedBySessionId);
    if (refusal) {
      this.audit.record("pairing.refused_capacity", "A new pairing challenge was refused: too many are waiting for approval.", {
        sessionId: input.requestedBySessionId ?? null,
        clientId: input.requestedByClientId ?? null,
        scope: refusal.scope,
        ...this.addressFields(input.requestedBySessionId)
      });
      throw refusal;
    }
    const pairing = this.pairings.create(input);
    this.audit.record("pairing.created", "Client pairing challenge created.", {
      pairingCode: pairing.pairingCode,
      projectId: input.projectId ?? null,
      ...this.addressFields(input.requestedBySessionId)
    });
    return pairing;
  }

  async approve(pairingCode: string, input: { approvedByUserId: string; approvedBySessionId?: string | undefined }): Promise<ClientGatewaySession | null> {
    await this.facade.ready();
    this.pairings.pruneExpired();
    const pairing = this.pairings.get(pairingCode);
    if (!pairing && this.pairings.withdrawalReason(pairingCode) !== undefined) {
      throw this.refuse(pairingCode, "pairing.client_disconnected", CLIENT_DISCONNECTED);
    }
    if (!pairing || pairing.consumedAt || !pairing.requestedBySessionId) return null;
    const approvedByUserId = input.approvedByUserId.trim();
    if (!approvedByUserId) throw new Error("Approving operator is required.");
    return this.complete(pairing.requestedBySessionId, pairingCode, approvedByUserId, input.approvedBySessionId);
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
      clientId: pairing.requestedByClientId ?? null,
      ...this.addressFields(pairing.requestedBySessionId)
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
      this.audit.record("pairing.withdrawn", "Client pairing challenge withdrawn because its session ended.", { pairingCode, sessionId, reason, ...this.addressFields(sessionId) });
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

  private async complete(sessionId: string, pairingCode: string, approvedByUserId: string, approvedBySessionId?: string): Promise<ClientGatewaySession | null> {
    this.pairings.pruneExpired();
    const pairing = this.pairings.get(pairingCode);
    if (!pairing || pairing.consumedAt) return null;
    const session = this.sessions.get(sessionId);
    if (!session) throw this.refuse(pairingCode, "pairing.client_disconnected", CLIENT_DISCONNECTED);
    const refusal = this.refusalFor(session, pairingCode);
    if (refusal) throw refusal;
    return this.trustGrant.grant({
      session,
      approvedByUserId,
      approvedBySessionId,
      ...(pairing.projectId !== undefined ? { projectId: pairing.projectId } : {}),
      // The browser can leave while the trust is saved, or the pairing be settled another way.
      lateRefusal: () => {
        const replaced = this.sessions.get(sessionId) !== session || this.pairings.get(pairingCode) !== pairing;
        if (replaced) return this.refuse(pairingCode, "pairing.client_disconnected", CLIENT_DISCONNECTED);
        return this.refusalFor(session, pairingCode) ?? (pairing.consumedAt ? this.refuse(pairingCode, "pairing.not_waiting", NOT_WAITING) : undefined);
      },
      lateRevocationReason: "pairing session ended before approval completed",
      bind: (trustedClient) => {
        pairing.consumedAt = trustedClient.approvedAt;
        pairing.sessionId = sessionId;
        pairing.userId = approvedByUserId;
        delete session.pendingPairingCode;
        this.pairings.removeOthersForSession(sessionId, pairingCode);
      },
      traceEvent: "pairing.approved",
      traceDetail: (trustedClient) => ({ trustedClientId: trustedClient.trustedClientId, projectId: pairing.projectId ?? null }),
      audit: {
        type: "session.paired",
        message: "Client session paired and durable trust created.",
        metadata: (trustedClient) => ({
          sessionId,
          pairingCode,
          trustedClientId: trustedClient.trustedClientId,
          approvedByUserId,
          projectId: pairing.projectId ?? null,
          ...clientGatewayPeerAuditFields(session.peer)
        })
      }
    });
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
    this.audit.record("pairing.refused", "Client pairing approval refused; no trust was kept.", { pairingCode, code, ...this.addressFields(this.pairings.get(pairingCode)?.requestedBySessionId) });
    return Object.assign(new Error(message), { code });
  }

  /** The requesting session's address prefix for an audit entry; nothing when it gave no peer or is gone. */
  private addressFields(sessionId: string | undefined): JsonObject {
    return clientGatewayPeerAuditFields(sessionId === undefined ? undefined : this.sessions.get(sessionId)?.peer);
  }
}

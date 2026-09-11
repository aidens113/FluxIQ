import type { ClientGatewaySession } from "@fluxiq/contracts/client-gateway";
import type { ClientGatewayAuditLog } from "./audit-log.ts";
import type { ClientGatewayLifecycle } from "./lifecycle.ts";
import type { ClientGatewaySessionRegistry } from "./sessions.ts";
import type { ClientGatewayTransport } from "./transport.ts";
import type { ClientGatewayTrustedClientRegistry } from "./trusted-clients.ts";

import type { ClientGatewayFacadePorts } from "./facade-ports.ts";

type AccessCollaborators = {
  sessions: ClientGatewaySessionRegistry;
  trustedClients: ClientGatewayTrustedClientRegistry;
  transport: ClientGatewayTransport;
  audit: ClientGatewayAuditLog;
  lifecycle: ClientGatewayLifecycle;
  // Calls into the service's public surface go through this port, never
  // through the collaborator that owns the method. See ./facade-ports.ts.
  facade: ClientGatewayFacadePorts;
};

/**
 * Granting and withdrawing access with a bearer token: the two operations an
 * operator or an HTTP caller performs against existing trust, as opposed to the
 * pairing flow that creates it.
 */
export class ClientGatewayAccess {
  private readonly sessions: ClientGatewaySessionRegistry;
  private readonly trustedClients: ClientGatewayTrustedClientRegistry;
  private readonly transport: ClientGatewayTransport;
  private readonly audit: ClientGatewayAuditLog;
  private readonly lifecycle: ClientGatewayLifecycle;
  private readonly facade: ClientGatewayFacadePorts;

  constructor(collaborators: AccessCollaborators) {
    this.sessions = collaborators.sessions;
    this.trustedClients = collaborators.trustedClients;
    this.transport = collaborators.transport;
    this.audit = collaborators.audit;
    this.lifecycle = collaborators.lifecycle;
    this.facade = collaborators.facade;
  }

  /** The ready session a bearer token speaks for, or null if it speaks for none. */
  async authorizeToken(token: string | null | undefined): Promise<ClientGatewaySession | null> {
    await this.facade.ready();
    const normalizedToken = typeof token === "string" ? token.trim() : "";
    if (!normalizedToken) return null;
    const trustedClient = this.trustedClients.resolveByToken(normalizedToken);
    if (!trustedClient || !this.trustedClients.isActive(trustedClient)) return null;
    const session = this.sessions.findReadyByTrustedClient(trustedClient.trustedClientId);
    if (!session) return null;
    this.sessions.touch(session);
    return this.sessions.toPublic(session);
  }

  async revokeTrustedClient(trustedClientId: string, reason = "revoked by operator"): Promise<boolean> {
    await this.facade.ready();
    const trustedClient = this.trustedClients.get(trustedClientId);
    if (!trustedClient || trustedClient.revokedAt) return false;
    await this.trustedClients.revoke(trustedClient, reason);
    for (const session of this.sessions.listReadyByTrustedClient(trustedClientId)) {
      await this.transport.send(session.sessionId, this.transport.message("server.disconnect", { reason: "Client trust was revoked." }, session));
      this.facade.disconnect(session.sessionId, "client trust revoked");
    }
    this.audit.record("trust.revoked", "Trusted client access revoked.", { trustedClientId, clientId: trustedClient.clientId, reason });
    return true;
  }
}

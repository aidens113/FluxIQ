import type { ClientGatewaySession, ClientGatewayTrustedClient } from "@fluxiq/contracts/client-gateway";
import type { ClientGatewayAuditLog } from "./audit-log.ts";
import type { ClientGatewayCredentialCustodian } from "./credential-custody.ts";
import { declaredDomainId } from "./declared-domain.ts";
import { clientGatewayCredentialHolder, type ClientGatewayLifecycle } from "./lifecycle.ts";
import type { ClientGatewaySessionRegistry } from "./sessions.ts";
import type { ClientGatewayTransport } from "./transport.ts";
import type { ClientGatewayTrustedClientRegistry } from "./trusted-clients.ts";
import type { ClientGatewayTraceTap } from "./trace-tap/index.ts";

import type { ClientGatewayFacadePorts } from "./facade-ports.ts";

type AccessCollaborators = {
  sessions: ClientGatewaySessionRegistry;
  trustedClients: ClientGatewayTrustedClientRegistry;
  transport: ClientGatewayTransport;
  audit: ClientGatewayAuditLog;
  lifecycle: ClientGatewayLifecycle;
  trace: ClientGatewayTraceTap;
  // Calls into the service's public surface go through this port, never
  // through the collaborator that owns the method. See ./facade-ports.ts.
  facade: ClientGatewayFacadePorts;
  custody: ClientGatewayCredentialCustodian;
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
  private readonly trace: ClientGatewayTraceTap;
  private readonly custody: ClientGatewayCredentialCustodian;

  constructor(collaborators: AccessCollaborators) {
    this.sessions = collaborators.sessions;
    this.trustedClients = collaborators.trustedClients;
    this.transport = collaborators.transport;
    this.audit = collaborators.audit;
    this.lifecycle = collaborators.lifecycle;
    this.facade = collaborators.facade;
    this.trace = collaborators.trace;
    this.custody = collaborators.custody;
  }

  /** Ends the trust this credential speaks for: a browser forgetting its pairing while it had no socket. False when it speaks for none. */
  async forgetByCredential(token: string): Promise<boolean> {
    await this.lifecycle.refuseReuse(token);
    const client = this.trustedClients.resolveByToken(token);
    if (!client || !this.trustedClients.isActive(client)) return false;
    return this.revokeTrustedClient(client.trustedClientId, "forgotten by its person");
  }

  /**
   * The ready session a bearer token speaks for, or null if it speaks for none.
   * The session's declared domain is always the one its trust was approved
   * for, so a caller may scope the token by `metadata.domainId`.
   */
  async authorizeToken(token: string | null | undefined): Promise<ClientGatewaySession | null> {
    await this.facade.ready();
    const normalizedToken = typeof token === "string" ? token.trim() : "";
    if (!normalizedToken) return null;
    await this.lifecycle.refuseReuse(normalizedToken);
    const trustedClient = this.trustedClients.resolveByToken(normalizedToken);
    if (!trustedClient || !this.trustedClients.isActive(trustedClient)) return null;
    const session = this.sessions.findReadyByTrustedClient(trustedClient.trustedClientId);
    if (!session) return null;
    if (trustedClient.domainId === undefined || trustedClient.domainId !== declaredDomainId(session.metadata)) return null;
    this.sessions.touch(session);
    await this.notedCurrentUse(trustedClient, normalizedToken);
    // A message from this client brings back what its credential keeps, before anything it asks for looks.
    await this.custody.presented({ holder: clientGatewayCredentialHolder(trustedClient), credential: normalizedToken });
    // Each of those took a moment, and a revoke in one of them must stand.
    if (!this.trustedClients.isActive(trustedClient)) {
      await this.custody.forgotten(trustedClient.trustedClientId);
      return null;
    }
    return this.sessions.toPublic(session);
  }

  /**
   * Using its current credential confirms a rotation and slides the client's life. A
   * store that refuses either is audited, not raised: the request is authorized, and
   * the next one tries again. The credential before, presented while it is still
   * valid, confirms nothing and slides nothing.
   */
  private async notedCurrentUse(trustedClient: ClientGatewayTrustedClient, token: string): Promise<void> {
    if (!this.trustedClients.isCurrentToken(trustedClient, token)) return;
    try {
      if (await this.trustedClients.confirmCurrent(trustedClient)) await this.custody.confirmed({ holder: clientGatewayCredentialHolder(trustedClient), credential: token });
      await this.trustedClients.renew(trustedClient);
    } catch (error) {
      this.audit.record("trust.renew_failed", "A trusted client's credential could not be renewed; it stays valid until it expires.", { trustedClientId: trustedClient.trustedClientId, error: error instanceof Error ? error.name : "non_error" });
    }
  }

  async revokeTrustedClient(trustedClientId: string, reason = "revoked by operator"): Promise<boolean> {
    await this.facade.ready();
    const trustedClient = this.trustedClients.get(trustedClientId);
    if (!trustedClient || trustedClient.revokedAt) return false;
    await this.trustedClients.revoke(trustedClient, reason);
    await this.custody.forgotten(trustedClientId);
    for (const session of this.sessions.listReadyByTrustedClient(trustedClientId)) {
      this.trace.lifecycle({ sessionId: session.sessionId, clientId: session.clientId }, "trust.revoked", { trustedClientId, reason });
      await this.transport.send(session.sessionId, this.transport.message("server.disconnect", { reason: "Client trust was revoked." }, session));
      this.facade.disconnect(session.sessionId, "client trust revoked");
    }
    this.audit.record("trust.revoked", "Trusted client access revoked.", { trustedClientId, clientId: trustedClient.clientId, reason });
    return true;
  }
}

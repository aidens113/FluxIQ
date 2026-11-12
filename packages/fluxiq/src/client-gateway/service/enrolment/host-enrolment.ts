import type { ClientGatewayManagedHost } from "@fluxiq/contracts/client-gateway";
import type { ClientGatewayAuditLog } from "../audit-log.ts";
import { declaredDomainId } from "../declared-domain.ts";
import type { ClientGatewayFacadePorts } from "../facade-ports.ts";
import { clientGatewayPeerAuditFields } from "../security/index.ts";
import type { ClientGatewaySessionRegistry } from "../sessions.ts";
import type { ClientGatewayTransport } from "../transport.ts";
import type { ClientGatewayTrustGrant } from "../trust-grant.ts";
import type { ClientGatewayTrustedClientRegistry } from "../trusted-clients.ts";
import type { InternalSession } from "../types.ts";
import { CLIENT_GATEWAY_ENROLMENT_REFUSALS, type ClientGatewayEnrolmentRefusalCode } from "./enrolment-refusal.ts";
import type { ClientGatewayHostEnrolmentTickets } from "./host-enrolment-tickets.ts";
import { FLUXIQ_MANAGED_HOST_PRINCIPAL } from "./managed-host-principal.ts";
import { ClientGatewayManagedHostRuns } from "./managed-runs.ts";
import type { ClientGatewayHostEnrolmentRequest, ClientGatewayHostEnrolmentTicket, ClientGatewayManagedHosts } from "./types.ts";

type HostEnrolmentCollaborators = {
  tickets: ClientGatewayHostEnrolmentTickets;
  sessions: ClientGatewaySessionRegistry;
  trustedClients: ClientGatewayTrustedClientRegistry;
  transport: ClientGatewayTransport;
  audit: ClientGatewayAuditLog;
  trustGrant: ClientGatewayTrustGrant;
  // Calls into the service's public surface go through this port, never
  // through the collaborator that owns the method. See ../facade-ports.ts.
  facade: ClientGatewayFacadePorts;
};

/** The session went away while its trust was being saved: nobody is left to tell. */
class EnrolmentAbandoned extends Error {}

/**
 * Managed hosts: the clients the engine launched itself, enrolled by a one-time
 * ticket it minted in its own process instead of by a person's approval. A
 * redeemed ticket takes the same trust grant a pairing does
 * (`../trust-grant.ts`), acting for `FLUXIQ_MANAGED_HOST_PRINCIPAL`. A refused
 * one is told its code and closed: a managed host never pairs.
 *
 * Neither a ticket nor a token is ever audited, traced or put in an error;
 * entries name the host and the code only.
 */
export class ClientGatewayHostEnrolment implements ClientGatewayManagedHosts {
  private readonly tickets: ClientGatewayHostEnrolmentTickets;
  private readonly sessions: ClientGatewaySessionRegistry;
  private readonly trustedClients: ClientGatewayTrustedClientRegistry;
  private readonly transport: ClientGatewayTransport;
  private readonly audit: ClientGatewayAuditLog;
  private readonly trustGrant: ClientGatewayTrustGrant;
  private readonly facade: ClientGatewayFacadePorts;
  private readonly runs: ClientGatewayManagedHostRuns;

  constructor(collaborators: HostEnrolmentCollaborators) {
    this.tickets = collaborators.tickets;
    this.sessions = collaborators.sessions;
    this.runs = new ClientGatewayManagedHostRuns(collaborators.sessions, (id) => {
      const client = collaborators.trustedClients.get(id);
      return client !== undefined && collaborators.trustedClients.isActive(client);
    });
    this.trustedClients = collaborators.trustedClients;
    this.transport = collaborators.transport;
    this.audit = collaborators.audit;
    this.trustGrant = collaborators.trustGrant;
    this.facade = collaborators.facade;
  }

  /** Mints the host's one live ticket, revoking any it had. */
  issueHostEnrolment(request: ClientGatewayHostEnrolmentRequest): ClientGatewayHostEnrolmentTicket {
    const minted = this.tickets.issue(request);
    this.audit.record("enrolment.issued", "An enrolment ticket was minted for a managed host.", { hostId: request.hostId.trim(), domainId: request.domainId.trim(), profile: request.profile, expiresAt: minted.expiresAt });
    return minted;
  }

  bindRun(input: Parameters<ClientGatewayManagedHostRuns["bind"]>[0]): () => void { return this.runs.bind(input); }
  currentRun(sessionId: string): ReturnType<ClientGatewayManagedHostRuns["current"]> { return this.runs.current(sessionId); }

  /** A hello presented `ticket`: enrol the session, or refuse it and close it. The ticket is consumed either way. */
  async enrol(session: InternalSession, ticket: string): Promise<void> {
    const redemption = this.tickets.redeem(ticket, declaredDomainId(session.metadata));
    if (redemption.kind === "refused") {
      await this.refuse(session, redemption.code, redemption.hostId);
      return;
    }
    const { binding } = redemption;
    const abandoned = new EnrolmentAbandoned("enrolment.client_disconnected");
    try {
      await this.trustGrant.grant({
        session,
        approvedByUserId: FLUXIQ_MANAGED_HOST_PRINCIPAL,
        managedHost: { hostId: binding.hostId, profile: binding.profile },
        lateRefusal: () => (this.stillConnected(session) ? undefined : abandoned),
        lateRevocationReason: "managed host session ended before its enrolment completed",
        traceEvent: "enrolment.redeemed",
        traceDetail: (trustedClient) => ({ trustedClientId: trustedClient.trustedClientId, managedHostId: binding.hostId }),
        audit: {
          type: "session.enrolled",
          message: "A managed host redeemed its enrolment ticket and durable trust was created.",
          metadata: (trustedClient) => ({
            sessionId: session.sessionId,
            clientId: session.clientId,
            trustedClientId: trustedClient.trustedClientId,
            managedHostId: binding.hostId,
            profile: binding.profile,
            approvedByUserId: FLUXIQ_MANAGED_HOST_PRINCIPAL,
            ...clientGatewayPeerAuditFields(session.peer)
          })
        }
      });
    } catch (error) {
      if (error !== abandoned) throw error;
      this.audit.recordSecurity("enrolment.abandoned", "A managed host's session ended while its enrolment was saved, so its trust was taken back.", { sessionId: session.sessionId, managedHostId: binding.hostId });
    }
  }

  /** Ends the host's live ticket and every active trust enrolled for it; answers how many trusts ended. */
  async revokeManagedHost(hostId: string, reason = "managed host closed"): Promise<number> {
    await this.facade.ready();
    if (this.tickets.revokeForHost(hostId)) this.audit.record("enrolment.ticket_revoked", "A managed host's live enrolment ticket was revoked.", { hostId });
    return await this.revokeTrust((managedHost) => managedHost.hostId === hostId, reason);
  }

  /** Ends every active trust of a fresh-profile host: its profile is gone, so nothing can present its credential honestly. */
  async revokeStaleManagedHosts(): Promise<number> {
    await this.facade.ready();
    return await this.revokeTrust((managedHost) => managedHost.profile === "fresh", "fresh managed host from an earlier engine run");
  }

  private async revokeTrust(matches: (managedHost: ClientGatewayManagedHost) => boolean, reason: string): Promise<number> {
    let revoked = 0;
    for (const client of this.trustedClients.list()) {
      if (client.managedHost === undefined || !matches(client.managedHost) || !this.trustedClients.isActive(client)) continue;
      if (await this.facade.revokeTrustedClient(client.trustedClientId, reason)) revoked += 1;
    }
    return revoked;
  }

  private stillConnected(session: InternalSession): boolean {
    return this.sessions.get(session.sessionId) === session && session.disconnectedAt === undefined && session.status !== "disconnected";
  }

  private async refuse(session: InternalSession, code: ClientGatewayEnrolmentRefusalCode, hostId: string | undefined): Promise<void> {
    const message = refusalMessage(code);
    this.audit.recordSecurity("enrolment.refused", "A managed host's enrolment ticket was refused, so the session was closed.", {
      sessionId: session.sessionId,
      clientId: session.clientId,
      code,
      ...(hostId !== undefined ? { hostId } : {}),
      ...clientGatewayPeerAuditFields(session.peer)
    });
    await this.transport.send(session.sessionId, this.transport.message("server.error", { code, message }, session));
    await this.transport.send(session.sessionId, this.transport.message("server.disconnect", { reason: message }, session));
    this.facade.disconnect(session.sessionId, "enrolment refused");
  }
}

function refusalMessage(code: ClientGatewayEnrolmentRefusalCode): string {
  for (const refusal of Object.values(CLIENT_GATEWAY_ENROLMENT_REFUSALS)) if (refusal.code === code) return refusal.message;
  return CLIENT_GATEWAY_ENROLMENT_REFUSALS.unknown.message;
}

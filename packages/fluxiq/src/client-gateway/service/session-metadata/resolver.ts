import type { ClientGatewayTrustedClient } from "@fluxiq/contracts/client-gateway";
import { connectUserSummarySchema, connectWorkspaceSummarySchema } from "@fluxiq/contracts/platform";
import type { ClientGatewayAuditLog } from "../audit-log.ts";
import { declaredDomainId } from "../declared-domain.ts";
import type { ClientGatewayFacadePorts } from "../facade-ports.ts";
import type { ClientGatewaySessionRegistry } from "../sessions.ts";
import type { ClientGatewayTransport } from "../transport.ts";
import { ClientGatewayTrustEndedError } from "../trust-ended-error.ts";
import type { ClientGatewayTrustedClientRegistry } from "../trusted-clients.ts";
import type { InternalSession } from "../types.ts";
import type { ClientGatewayResolvedSessionMetadata, ClientGatewaySessionMetadataBinding, ClientGatewaySessionMetadataProvider } from "./types.ts";
import { ClientGatewaySessionMetadataUnavailableError } from "./unavailable-error.ts";

type Options = {
  sessions: ClientGatewaySessionRegistry;
  trustedClients: ClientGatewayTrustedClientRegistry;
  transport: ClientGatewayTransport;
  audit: ClientGatewayAuditLog;
  facade: ClientGatewayFacadePorts;
  provider: ClientGatewaySessionMetadataProvider | undefined;
};

/** Shared authority gate for both actual ready send sites, independent of panel session/key state. */
export class ClientGatewaySessionMetadataResolver {
  constructor(private readonly options: Options) {}

  capture(session: InternalSession, client: ClientGatewayTrustedClient): ClientGatewaySessionMetadataBinding {
    return {
      session, client, trustedClientId: client.trustedClientId, clientId: client.clientId,
      clientType: client.clientType, userId: client.approvedByUserId, domainId: client.domainId,
      managedHost: client.managedHost, managedHostId: client.managedHost?.hostId, managedHostProfile: client.managedHost?.profile
    };
  }

  current(binding: ClientGatewaySessionMetadataBinding, tokenHash?: string): boolean {
    const { session, client } = binding;
    return this.options.sessions.get(session.sessionId) === session && session.disconnectedAt === undefined
      && session.status !== "disconnected" && this.options.trustedClients.get(binding.trustedClientId) === client
      && this.options.trustedClients.isActive(client) && client.trustedClientId === binding.trustedClientId
      && client.clientId === binding.clientId && client.clientType === binding.clientType
      && client.approvedByUserId === binding.userId && client.domainId === binding.domainId
      && client.managedHost === binding.managedHost && client.managedHost?.hostId === binding.managedHostId
      && client.managedHost?.profile === binding.managedHostProfile && session.clientId === binding.clientId
      && session.clientType === binding.clientType && declaredDomainId(session.metadata) === binding.domainId
      && (session.trustedClientId === undefined || session.trustedClientId === binding.trustedClientId)
      && (session.operatorUserId === undefined || session.operatorUserId === binding.userId)
      && (tokenHash === undefined || client.tokenHash === tokenHash);
  }

  assert(binding: ClientGatewaySessionMetadataBinding, tokenHash?: string): void {
    if (!this.options.trustedClients.isActive(binding.client)) throw new ClientGatewayTrustEndedError();
    if (!this.current(binding, tokenHash)) throw new ClientGatewaySessionMetadataUnavailableError();
  }

  async resolve(binding: ClientGatewaySessionMetadataBinding, token: string, currentOnly: boolean): Promise<ClientGatewayResolvedSessionMetadata> {
    this.assert(binding);
    const proof = await this.options.trustedClients.readCommittedCredential(binding.client);
    this.assert(binding);
    if (!proof || !this.current(binding, proof.tokenHash) || !this.accepts(binding, token, currentOnly)) throw new ClientGatewaySessionMetadataUnavailableError();
    let summaries;
    if (this.options.provider && binding.managedHost === undefined) {
      let value;
      try {
        value = await this.options.provider(Object.freeze({ trustedClientId: binding.trustedClientId, userId: binding.userId, clientType: binding.clientType }));
        const user = connectUserSummarySchema.safeParse(value?.user);
        const workspace = connectWorkspaceSummarySchema.safeParse(value?.workspace);
        if (!user.success || !workspace.success || user.data.userId !== binding.userId) throw new ClientGatewaySessionMetadataUnavailableError();
        summaries = { user: user.data, workspace: workspace.data };
      } catch {
        throw new ClientGatewaySessionMetadataUnavailableError();
      }
    }
    this.assert(binding, proof.tokenHash);
    if (binding.client.expiresAt !== proof.expiresAt || !this.accepts(binding, token, currentOnly)) throw new ClientGatewaySessionMetadataUnavailableError();
    return { tokenHash: proof.tokenHash, fields: { credentialExpiresAt: proof.expiresAt, ...summaries } };
  }

  async refuse(session: InternalSession): Promise<void> {
    if (this.options.sessions.get(session.sessionId) !== session || session.disconnectedAt !== undefined) return;
    const error = new ClientGatewaySessionMetadataUnavailableError();
    this.options.audit.record("session.metadata_unavailable", "Client metadata could not be verified; no ready session was published.", { sessionId: session.sessionId });
    try {
      await this.options.transport.send(session.sessionId, this.options.transport.message("server.error", { code: error.code, message: error.message }, session));
      if (this.options.sessions.get(session.sessionId) === session && session.disconnectedAt === undefined) {
        await this.options.transport.send(session.sessionId, this.options.transport.message("server.disconnect", { reason: error.message }, session));
      }
    } catch {
      this.options.audit.record("session.metadata_refusal_delivery_failed", "The metadata refusal could not reach its socket.", { sessionId: session.sessionId });
    }
    if (this.options.sessions.get(session.sessionId) === session && session.disconnectedAt === undefined) this.options.facade.disconnect(session.sessionId, "session metadata unavailable");
  }

  private accepts(binding: ClientGatewaySessionMetadataBinding, token: string, currentOnly: boolean): boolean {
    return currentOnly ? this.options.trustedClients.isCurrentToken(binding.client, token)
      : this.options.trustedClients.resolveByToken(token) === binding.client;
  }
}

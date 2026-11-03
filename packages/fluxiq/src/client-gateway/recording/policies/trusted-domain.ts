import type { ClientGatewaySession, ClientGatewaySnapshotView, ClientGatewayStartRecordingRequest } from "@fluxiq/contracts/client-gateway";

/** Reads the gateway's existing approval; submitted metadata never selects policy. */
export class TrustedRecordingDomain {
  constructor(
    private readonly gateway: { snapshot(): Pick<ClientGatewaySnapshotView, "sessions" | "trustedClients"> },
    private readonly projects: { receiver: object; assertDomain(projectId: string, domainId: string | null): Promise<void> }
  ) {}

  read(session: ClientGatewaySession, request: ClientGatewayStartRecordingRequest): { trustedClientId: string; domainId: string | null } {
    const snapshot = this.gateway.snapshot();
    const current = snapshot.sessions.find(item => item.sessionId === session.sessionId);
    const trusted = current?.trustedClientId ? snapshot.trustedClients.find(item => item.trustedClientId === current.trustedClientId) : undefined;
    if (!current || current.status !== "ready" || current.clientId !== session.clientId || current.trustedClientId !== session.trustedClientId || !trusted || trusted.status !== "active" || trusted.clientId !== current.clientId || trusted.clientType !== current.clientType) throw new Error("recording.client_scope_refused");
    const domainId = trusted.domainId;
    if (domainId !== null && (typeof domainId !== "string" || !domainId.trim() || domainId !== domainId.trim())) throw new Error("recording.domain_scope_refused");
    for (const supplied of [request.domainId, request.environment?.domainId, request.metadata?.domainId]) {
      if (supplied !== undefined && supplied !== domainId) throw new Error("recording.domain_scope_refused");
    }
    return { trustedClientId: trusted.trustedClientId, domainId };
  }

  async assertProject(session: ClientGatewaySession, request: ClientGatewayStartRecordingRequest, projectId: string | null | undefined, approved: ReturnType<TrustedRecordingDomain["read"]>): Promise<void> {
    const before = this.read(session, request);
    if (before.trustedClientId !== approved.trustedClientId || before.domainId !== approved.domainId) throw new Error("recording.client_scope_refused");
    if (projectId) await this.projects.assertDomain.call(this.projects.receiver, projectId, approved.domainId);
    else if (approved.domainId !== null) throw new Error("recording.project_required");
    const after = this.read(session, request);
    if (after.trustedClientId !== approved.trustedClientId || after.domainId !== approved.domainId) throw new Error("recording.client_scope_refused");
  }
}

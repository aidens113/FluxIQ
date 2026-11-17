import type { ClientGatewaySession, ClientGatewaySnapshotView, ClientGatewayTrustedClientView } from "fluxiq/client-gateway";
import type { WorkspaceRouteBinding } from "../../../../lib/workspaces";

/** Ownership must be server-bound. Pending challenges and arbitrary audit metadata have no such proof. */
export function callerGatewaySnapshot(snapshot: ClientGatewaySnapshotView, binding: WorkspaceRouteBinding, profile: "local" | "self-hosted" | "service", visibleProjectId: string | null): ClientGatewaySnapshotView {
  if (binding.channel === "panel" && profile !== "service") return structuredClone(snapshot);
  const trusted = snapshot.trustedClients.filter(client => client.approvedByUserId === binding.userId && (binding.channel === "panel" || client.trustedClientId === binding.trustedClientId && client.clientId === binding.clientId && client.clientType === binding.clientType && client.domainId === binding.domainId && client.managedHost === undefined));
  const sessions = snapshot.sessions.filter(session => session.operatorUserId === binding.userId && (binding.channel === "panel" || session.sessionId === binding.sessionId && session.clientId === binding.clientId && session.clientType === binding.clientType && session.trustedClientId === binding.trustedClientId && session.managedHostId === undefined && sessionDomain(session) === binding.domainId));
  return {
    enabled: snapshot.enabled,
    ...(snapshot.publicUrl ? { publicUrl: snapshot.publicUrl } : {}),
    sessions: sessions.map(session => publicSession(session, visibleProjectId)),
    trustedClients: trusted.map(publicTrust),
    pairings: [],
    auditLog: []
  };
}

function sessionDomain(session: ClientGatewaySession) {
  const domain = session.metadata?.domainId;
  return typeof domain === "string" && domain.trim() ? domain.trim() : null;
}

function publicSession(session: ClientGatewaySession, visibleProjectId: string | null): ClientGatewaySession {
  return {
    sessionId: session.sessionId, clientId: session.clientId, clientType: session.clientType,
    name: session.name, status: session.status, connectedAt: session.connectedAt, lastSeenAt: session.lastSeenAt,
    ...(session.version !== undefined ? { version: session.version } : {}),
    ...(session.pairedAt !== undefined ? { pairedAt: session.pairedAt } : {}),
    ...(session.disconnectedAt !== undefined ? { disconnectedAt: session.disconnectedAt } : {}),
    ...(session.trustedClientId !== undefined ? { trustedClientId: session.trustedClientId } : {}),
    ...(session.operatorUserId !== undefined ? { operatorUserId: session.operatorUserId } : {}),
    ...(session.projectId && session.projectId === visibleProjectId ? { projectId: session.projectId } : {}),
    ...(session.activeRecordingId !== undefined ? { activeRecordingId: session.activeRecordingId } : {}),
    capabilities: session.capabilities.map(capability => ({ id: capability.id, kind: capability.kind, ...(capability.label !== undefined ? { label: capability.label } : {}), ...(capability.actionTypes !== undefined ? { actionTypes: [...capability.actionTypes] } : {}) }))
  };
}

function publicTrust(client: ClientGatewayTrustedClientView): ClientGatewayTrustedClientView {
  return {
    trustedClientId: client.trustedClientId, clientId: client.clientId, clientType: client.clientType,
    name: client.name, approvedByUserId: client.approvedByUserId, status: client.status,
    approvedAt: client.approvedAt, createdAt: client.createdAt, updatedAt: client.updatedAt,
    lastUsedAt: client.lastUsedAt, expiresAt: client.expiresAt,
    ...(client.domainId !== undefined ? { domainId: client.domainId } : {}),
    ...(client.revokedAt !== undefined ? { revokedAt: client.revokedAt } : {})
  };
}

import { pairedClientDomainScope } from "fluxiq/server";
import type { WorkspaceRouteContext } from "../../../../../lib/workspaces/routes";

/** Only denies a change from the already authenticated immutable gateway binding. */
export function traceUploadCurrent(owner: WorkspaceRouteContext, url: string): boolean {
  if (!owner.current() || owner.binding.channel !== "paired-client") return false;
  const binding = owner.binding;
  const snapshot = owner.fluxiq.programs.clientGateway.snapshot();
  const session = snapshot.sessions.find(item => item.sessionId === binding.sessionId);
  const trust = snapshot.trustedClients.find(item => item.trustedClientId === binding.trustedClientId);
  if (!session || !trust) return false;
  const domain = pairedClientDomainScope(url, session);
  return session.status === "ready" && session.disconnectedAt === undefined && session.managedHostId === undefined
    && session.clientId === binding.clientId && session.clientType === binding.clientType && session.trustedClientId === binding.trustedClientId && session.operatorUserId === binding.userId
    && (session.projectId ?? null) === binding.projectId && (session.activeRecordingId ?? null) === binding.recordingId && domain?.domainId === binding.domainId
    && trust.clientId === binding.clientId && trust.clientType === binding.clientType && trust.approvedByUserId === binding.userId && trust.domainId === binding.domainId
    && trust.status === "active" && trust.revokedAt === undefined && trust.managedHost === undefined && owner.current();
}

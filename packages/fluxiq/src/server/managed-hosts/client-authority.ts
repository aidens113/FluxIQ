import type { ClientGatewaySession } from "@fluxiq/contracts/client-gateway";
import { IAM_POLICY_LANGUAGE_VERSION } from "@fluxiq/contracts/iam";
import type { FluxIQ } from "../../framework/index.ts";
import type { ProgramApiActor } from "../../programs/_shared/api.ts";
import { programIamIdSegment } from "../../programs/_shared/iam/index.ts";

/** Authority derived only after the gateway authenticated stored managed trust. */
export function managedClientAuthority(fluxiq: FluxIQ, session: ClientGatewaySession): {
  actor: ProgramApiActor;
  projectId: string;
  domainId: string;
  isCurrent(): boolean;
} | undefined {
  if (!session.managedHostId || !session.trustedClientId) return undefined;
  const binding = fluxiq.programs.clientGateway.managedHosts.currentRun(session.sessionId);
  if (!binding) return undefined;
  const project = programIamIdSegment(binding.projectId).segment;
  const client = programIamIdSegment(session.trustedClientId).segment;
  const ownProject = `frn:fluxiq:studio:\${fluxiq:WorkspaceId}:project/${project}`;
  const ownClient = `frn:fluxiq:gateway:\${fluxiq:WorkspaceId}:browser/${client}`;
  return {
    projectId: binding.projectId,
    domainId: binding.domainId,
    actor: {
      sessionId: `client-gateway:${session.sessionId}`, userId: `managed-host:${session.managedHostId}`, roleId: "", permissions: [], channel: "paired-client",
      serviceIdentity: { id: `managed-host:${session.managedHostId}`, policy: { Version: IAM_POLICY_LANGUAGE_VERSION, Statement: [
        { Sid: "RunPolicy", Effect: "Allow", Action: ["studio:GetRecordingCapturePolicy", "studio:WriteStateAsset"], Resource: ownProject },
        { Sid: "OwnClient", Effect: "Allow", Action: ["gateway:Snapshot", "gateway:PutTraceArtifact"], Resource: ownClient }
      ] } }
    },
    isCurrent: () => {
      const now = fluxiq.programs.clientGateway.managedHosts.currentRun(session.sessionId);
      return now !== undefined && now.projectId === binding.projectId && now.domainId === binding.domainId && now.runId === binding.runId
        && now.lease.resourceKey === binding.lease.resourceKey && now.lease.epoch === binding.lease.epoch;
    }
  };
}

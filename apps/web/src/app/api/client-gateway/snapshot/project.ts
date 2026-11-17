import { automationStudioPersonProject, automationStudioProjectName } from "fluxiq/automation-studio";
import { pairedClientProjectDomainRefusal, programDomainScope } from "fluxiq/server";
import type { WorkspaceRouteContext } from "../../../../lib/workspaces";
import { GatewaySnapshotRefusal, snapshotCaller, snapshotResource } from "./authority";

type SnapshotProject = { projectId: string | null; flowId: string | null; name: string | null };

export async function snapshotProject(owner: WorkspaceRouteContext, url: string, preference: { activeProjectId: string | null; activeFlowId: string | null }): Promise<SnapshotProject> {
  let caller = await snapshotCaller(owner);
  const binding = caller.binding;
  const domainId = binding.channel === "paired-client" ? binding.domainId : programDomainScope(url).domainId;
  let projectId = binding.channel === "paired-client" && binding.projectId !== null ? binding.projectId : preference.activeProjectId;
  if (!projectId && binding.channel === "paired-client") {
    projectId = await automationStudioPersonProject({ registry: owner.fluxiq.programs.api, actor: caller.actor, domainId });
    caller = await snapshotCaller(owner);
  }
  if (!projectId) return { projectId: null, flowId: null, name: null };
  const project: SnapshotProject = { projectId, flowId: preference.activeProjectId === projectId ? preference.activeFlowId : null, name: null };
  try {
    await revalidateSnapshotProject(owner, url, project);
  } catch (error) {
    if (error instanceof GatewaySnapshotRefusal && error.refusal.status === 403) return { projectId: null, flowId: null, name: null };
    throw error;
  }
  caller = await snapshotCaller(owner);
  project.name = await automationStudioProjectName({ registry: owner.fluxiq.programs.api, actor: caller.actor, domainId, projectId });
  await revalidateSnapshotProject(owner, url, project);
  return project;
}

export async function revalidateSnapshotProject(owner: WorkspaceRouteContext, url: string, project: SnapshotProject): Promise<void> {
  const caller = await snapshotCaller(owner);
  if (project.projectId === null) return;
  const binding = caller.binding;
  if (binding.channel === "paired-client" && binding.projectId !== null && binding.projectId !== project.projectId) throw projectUnavailable();
  const domainId = binding.channel === "paired-client" ? binding.domainId : programDomainScope(url).domainId;
  const domain = await pairedClientProjectDomainRefusal(owner.fluxiq.programs.automationStudio, project.projectId, domainId);
  await snapshotCaller(owner);
  if (domain) throw projectUnavailable();
  await snapshotResource(owner, project.projectId);
  if (project.flowId !== null) {
    await snapshotResource(owner, project.projectId, project.flowId);
    try {
      await owner.fluxiq.programs.automationStudio.getFlow(project.projectId, project.flowId);
    } catch {
      throw projectUnavailable();
    }
    await snapshotCaller(owner);
    const afterFlowDomain = await pairedClientProjectDomainRefusal(owner.fluxiq.programs.automationStudio, project.projectId, domainId);
    await snapshotCaller(owner);
    if (afterFlowDomain) throw projectUnavailable();
    await snapshotResource(owner, project.projectId, project.flowId);
  }
}

function projectUnavailable() {
  return new GatewaySnapshotRefusal({ ok: false, status: 403, error: "Selected project is not available." });
}

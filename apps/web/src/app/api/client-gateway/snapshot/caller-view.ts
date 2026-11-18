import { resolveFluxIQProfile } from "fluxiq/platform/profile";
import { getWorkspaceWebPresentation } from "../../../../lib/fluxiq";
import type { WorkspaceRouteContext } from "../../../../lib/workspaces";
import { snapshotCaller } from "./authority";
import { revalidateSnapshotProject, snapshotProject } from "./project";
import { callerGatewaySnapshot } from "./view";

/**
 * This caller's view of the gateway: the caller resolved, the project it can
 * see, and the gateway snapshot filtered to what that caller may know. The
 * snapshot route returns it and the change stream fingerprints it, so what a
 * caller is told changed and what it can read are decided in one place.
 */
export async function callerGatewayView(owner: WorkspaceRouteContext, url: string) {
  const binding = (await snapshotCaller(owner)).binding;
  const presentation = getWorkspaceWebPresentation(owner.workspaceId, owner.fluxiq, { userId: binding.userId, channel: binding.channel, ...(binding.channel === "paired-client" ? { clientId: binding.clientId } : {}) });
  const project = await snapshotProject(owner, url, presentation.present().automationStudio);
  await revalidateSnapshotProject(owner, url, project);
  const webRuntime = presentation.present();
  const snapshot = callerGatewaySnapshot(owner.fluxiq.programs.clientGateway.snapshot(), binding, resolveFluxIQProfile(process.env), project.projectId);
  return { snapshot, project, presentation, webRuntime };
}

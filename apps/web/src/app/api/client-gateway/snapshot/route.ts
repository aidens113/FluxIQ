import { NextResponse } from "next/server";
import { resolveFluxIQProfile } from "fluxiq/platform/profile";
import { appRouteIamContract } from "../../../../lib/app-route-iam";
import { getWorkspaceWebPresentation } from "../../../../lib/fluxiq";
import { workspaceRouteContext } from "../../../../lib/workspaces";
import { WorkspacePresentationError } from "../../../../lib/workspaces/presentation";
import { GatewaySnapshotRefusal, snapshotCaller } from "./authority";
import { snapshotProject, revalidateSnapshotProject } from "./project";
import { callerGatewaySnapshot } from "./view";

const ROUTE = appRouteIamContract("GET", "/api/client-gateway/snapshot");

export async function GET(request: Request) {
  const selected = await workspaceRouteContext(request, ROUTE);
  if (!selected.ok) return refused(selected);
  const owner = selected.context;
  try {
    await owner.fluxiq.programs.clientGateway.ready();
    const caller = await snapshotCaller(owner);
    const binding = caller.binding;
    const presentation = getWorkspaceWebPresentation(owner.workspaceId, owner.fluxiq, { userId: binding.userId, channel: binding.channel, ...(binding.channel === "paired-client" ? { clientId: binding.clientId } : {}) });
    const current = presentation.present();
    const project = await snapshotProject(owner, request.url, current.automationStudio);
    await revalidateSnapshotProject(owner, request.url, project);
    const webRuntime = presentation.present();
    const snapshot = callerGatewaySnapshot(owner.fluxiq.programs.clientGateway.snapshot(), binding, resolveFluxIQProfile(process.env), project.projectId);
    const response = NextResponse.json({ ok: true, payload: {
      ...snapshot,
      webRuntime: { ...webRuntime, automationStudio: { ...webRuntime.automationStudio, activeProjectId: project.projectId, activeFlowId: project.flowId, activeProjectName: project.name } }
    } }, { headers: { "cache-control": "private, no-store" } });
    await revalidateSnapshotProject(owner, request.url, project);
    presentation.context();
    if (!owner.current()) return refused({ status: 401, error: "Authentication required" });
    return response;
  } catch (error) {
    if (error instanceof GatewaySnapshotRefusal) return refused(error.refusal);
    if (error instanceof WorkspacePresentationError) return refused({ status: 503, error: "Selected workspace presentation is unavailable." });
    return NextResponse.json({ ok: false, error: "Client gateway snapshot could not be read." }, { status: 500, headers: { "cache-control": "private, no-store" } });
  } finally {
    owner.release();
  }
}

function refused(refusal: { status: number; error: string }) {
  return NextResponse.json({ ok: false, error: refusal.error }, { status: refusal.status, headers: { "cache-control": "private, no-store" } });
}


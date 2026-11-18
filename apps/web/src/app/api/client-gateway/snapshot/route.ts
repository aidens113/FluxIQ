import { NextResponse } from "next/server";
import { appRouteIamContract } from "../../../../lib/app-route-iam";
import { workspaceRouteContext } from "../../../../lib/workspaces";
import { WorkspacePresentationError } from "../../../../lib/workspaces/presentation";
import { GatewaySnapshotRefusal } from "./authority";
import { callerGatewayView } from "./caller-view";
import { revalidateSnapshotProject } from "./project";

const ROUTE = appRouteIamContract("GET", "/api/client-gateway/snapshot");

export async function GET(request: Request) {
  const selected = await workspaceRouteContext(request, ROUTE);
  if (!selected.ok) return refused(selected);
  const owner = selected.context;
  try {
    await owner.fluxiq.programs.clientGateway.ready();
    const { snapshot, project, presentation, webRuntime } = await callerGatewayView(owner, request.url);
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


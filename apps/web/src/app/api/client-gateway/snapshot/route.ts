import { NextRequest, NextResponse } from "next/server";
import { requireFluxIQUser } from "../../../../lib/auth";
import { getFluxIQ, getFluxIQWebRuntimeStatus } from "../../../../lib/fluxiq";
import { appRouteIamContract, authorizeAppRoute, pairedClientRouteActor, panelRouteActor } from "../../../../lib/app-route-iam";
import { automationStudioPersonProject, automationStudioProjectName } from "fluxiq/automation-studio";

const ROUTE = appRouteIamContract("GET", "/api/client-gateway/snapshot");

export async function GET(request: NextRequest) {
  const fluxiq = getFluxIQ();
  await fluxiq.programs.clientGateway.ready();
  const bearerToken = readBearerToken(request.headers.get("authorization"));
  if (bearerToken) {
    const clientSession = await fluxiq.programs.clientGateway.authorizeToken(bearerToken);
    if (!clientSession) return NextResponse.json({ ok: false, error: "Authentication required" }, { status: 401 });
    const actor = await pairedClientRouteActor(fluxiq.programs.identityAccess, clientSession);
    if (!actor) return NextResponse.json({ ok: false, error: "Authentication required" }, { status: 401 });
    const refusal = await authorizeAppRoute(fluxiq.programs.api, ROUTE, "paired-client", actor);
    if (refusal) return NextResponse.json({ ok: false, error: refusal.error }, { status: refusal.status });
    const webRuntime = getFluxIQWebRuntimeStatus(clientSession.operatorUserId);
    const domainId = typeof clientSession.metadata?.domainId === "string" ? clientSession.metadata.domainId : null;
    // A read: this person's own latest, or none. A browser with none asks `first-project` to make one.
    const activeProjectId = webRuntime.automationStudio.activeProjectId ?? await automationStudioPersonProject({ registry: fluxiq.programs.api, actor, domainId });
    // What the project is called, for the client to say in words. Additive: a client that ignores it reads what it always did.
    const activeProjectName = activeProjectId ? await automationStudioProjectName({ registry: fluxiq.programs.api, actor, domainId, projectId: activeProjectId }) : null;
    return NextResponse.json({
      ok: true,
      payload: {
        ...fluxiq.programs.clientGateway.snapshot(),
        webRuntime: { ...webRuntime, automationStudio: { ...webRuntime.automationStudio, activeProjectId, activeProjectName } }
      }
    });
  }

  const auth = await requireFluxIQUser();
  if (!auth) return NextResponse.json({ ok: false, error: "Authentication required" }, { status: 401 });
  const refusal = await authorizeAppRoute(fluxiq.programs.api, ROUTE, "panel", panelRouteActor(auth));
  if (refusal) return NextResponse.json({ ok: false, error: refusal.error }, { status: refusal.status });
  return NextResponse.json({
    ok: true,
    payload: {
      ...fluxiq.programs.clientGateway.snapshot(),
      webRuntime: getFluxIQWebRuntimeStatus(auth.user.id)
    }
  });
}

function readBearerToken(header: string | null): string | null {
  if (!header) return null;
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  return match?.[1]?.trim() || null;
}


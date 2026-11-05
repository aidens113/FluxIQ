import { NextResponse } from "next/server";
import { automationStudioPersonProject } from "fluxiq/automation-studio";
import { getFluxIQ } from "../../../../lib/fluxiq";
import { appRouteIamContract, authorizeAppRoute, pairedClientRouteActor } from "../../../../lib/app-route-iam";
import { readBearerToken } from "../../../../lib/program-route";

const ROUTE = appRouteIamContract("POST", "/api/client-gateway/first-project");

// A browser's chat has nowhere to be without a project, and nothing it could ask the person to do
// about that from there. So a browser whose person has none asks here. A person with a project of
// their own is told that one, never given a second, and the registry's own check decides the making.
export async function POST(request: Request) {
  const token = readBearerToken(request.headers.get("authorization"));
  if (!token) return NextResponse.json({ ok: false, error: "Authentication required" }, { status: 401 });
  const fluxiq = getFluxIQ();
  await fluxiq.programs.clientGateway.ready();
  const clientSession = await fluxiq.programs.clientGateway.authorizeToken(token);
  if (!clientSession) return NextResponse.json({ ok: false, error: "Authentication required" }, { status: 401 });
  const actor = await pairedClientRouteActor(fluxiq.programs.identityAccess, clientSession);
  if (!actor) return NextResponse.json({ ok: false, error: "Authentication required" }, { status: 401 });
  const refusal = await authorizeAppRoute(fluxiq.programs.api, ROUTE, "paired-client", actor);
  if (refusal) return NextResponse.json({ ok: false, error: refusal.error }, { status: refusal.status });
  const domainId = typeof clientSession.metadata?.domainId === "string" ? clientSession.metadata.domainId : null;
  const projectId = await automationStudioPersonProject({ registry: fluxiq.programs.api, actor, domainId, create: true });
  return NextResponse.json({ ok: true, payload: { projectId } });
}

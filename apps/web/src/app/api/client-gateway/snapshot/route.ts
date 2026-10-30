import { NextRequest, NextResponse } from "next/server";
import { requireFluxIQUser } from "../../../../lib/auth";
import { getFluxIQ, getFluxIQWebRuntimeStatus } from "../../../../lib/fluxiq";
import { appRouteIamContract, authorizeAppRoute, pairedClientRouteActor, panelRouteActor } from "../../../../lib/app-route-iam";

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
    return NextResponse.json({
      ok: true,
      payload: {
        ...fluxiq.programs.clientGateway.snapshot(),
        webRuntime: getFluxIQWebRuntimeStatus(clientSession.operatorUserId)
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


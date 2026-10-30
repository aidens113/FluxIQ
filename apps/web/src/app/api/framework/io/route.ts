import { NextResponse, type NextRequest } from "next/server";
import { requireFluxIQUser } from "../../../../lib/auth";
import { getFluxIQ } from "../../../../lib/fluxiq";
import { authorizeAppRoute, panelRouteActor } from "../../../../lib/app-route-iam";
import { operationalRouteContract } from "../../../../lib/operational-route-contract";

export async function GET(request: NextRequest) {
  const auth = await requireFluxIQUser();
  if (!auth) return NextResponse.json({ ok: false, error: "Authentication required" }, { status: 401 });
  const contract = operationalRouteContract("GET", "/api/framework/io");
  const fluxiq = getFluxIQ();
  const refusal = await authorizeAppRoute(fluxiq.programs.api, contract.iam, "panel", panelRouteActor(auth));
  if (refusal) return NextResponse.json({ ok: false, error: refusal.error }, { status: refusal.status });
  const domainId = request.nextUrl.searchParams.get("domain");
  return NextResponse.json({
    ok: true,
    domainId,
    io: fluxiq.ioSnapshot(domainId)
  });
}

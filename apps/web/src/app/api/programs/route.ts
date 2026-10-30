import { NextResponse, type NextRequest } from "next/server";
import { programDirectorySchema } from "fluxiq";
import { requireFluxIQUser } from "../../../lib/auth";
import { getFluxIQ } from "../../../lib/fluxiq";
import { appRouteIamContract, authorizeAppRoute, panelRouteActor } from "../../../lib/app-route-iam";

const ROUTE = appRouteIamContract("GET", "/api/programs");

export async function GET(request: NextRequest) {
  const auth = await requireFluxIQUser();
  if (!auth) return NextResponse.json({ ok: false, error: "Authentication required" }, { status: 401 });
  const fluxiq = getFluxIQ();
  const refusal = await authorizeAppRoute(fluxiq.programs.api, ROUTE, "panel", panelRouteActor(auth));
  if (refusal) return NextResponse.json({ ok: false, error: refusal.error }, { status: refusal.status });
  const domainId = request.nextUrl.searchParams.get("domain");
  const directory = fluxiq.programDirectory(domainId);
  return NextResponse.json(programDirectorySchema.parse(directory));
}

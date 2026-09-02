import { NextResponse, type NextRequest } from "next/server";
import { requireFluxIQUser } from "../../../../lib/auth";
import { getFluxIQ } from "../../../../lib/fluxiq";
import { canUseOperationalRoute, operationalRouteContract } from "../../../../lib/operational-route-contract";

export async function GET(request: NextRequest) {
  const auth = await requireFluxIQUser();
  if (!auth) return NextResponse.json({ ok: false, error: "Authentication required" }, { status: 401 });
  const contract = operationalRouteContract("GET", "/api/framework/io");
  if (!canUseOperationalRoute(auth.role.permissions, contract)) return NextResponse.json({ ok: false, error: `Permission required: ${contract.permission}` }, { status: 403 });
  const domainId = request.nextUrl.searchParams.get("domain");
  const fluxiq = getFluxIQ();
  return NextResponse.json({
    ok: true,
    domainId,
    io: fluxiq.ioSnapshot(domainId)
  });
}

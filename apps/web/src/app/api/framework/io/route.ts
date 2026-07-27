import { NextResponse, type NextRequest } from "next/server";
import { getFluxIQ } from "../../../../lib/fluxiq";

export function GET(request: NextRequest) {
  const domainId = request.nextUrl.searchParams.get("domain");
  const fluxiq = getFluxIQ();
  return NextResponse.json({
    ok: true,
    domainId,
    io: fluxiq.ioSnapshot(domainId)
  });
}

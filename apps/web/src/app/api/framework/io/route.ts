import { NextResponse, type NextRequest } from "next/server";
import { requireFluxIQUser } from "../../../../lib/auth";
import { getFluxIQ } from "../../../../lib/fluxiq";

export async function GET(request: NextRequest) {
  const auth = await requireFluxIQUser();
  if (!auth) return NextResponse.json({ ok: false, error: "Authentication required" }, { status: 401 });
  const domainId = request.nextUrl.searchParams.get("domain");
  const fluxiq = getFluxIQ();
  return NextResponse.json({
    ok: true,
    domainId,
    io: fluxiq.ioSnapshot(domainId)
  });
}

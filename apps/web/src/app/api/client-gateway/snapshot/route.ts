import { NextRequest, NextResponse } from "next/server";
import { requireFluxIQUser } from "../../../../lib/auth";
import { getFluxIQ, getFluxIQWebRuntimeStatus } from "../../../../lib/fluxiq";

export async function GET(request: NextRequest) {
  const fluxiq = getFluxIQ();
  await fluxiq.programs.clientGateway.ready();
  const bearerToken = readBearerToken(request.headers.get("authorization"));
  if (bearerToken) {
    const clientSession = await fluxiq.programs.clientGateway.authorizeToken(bearerToken);
    if (!clientSession) return NextResponse.json({ ok: false, error: "Authentication required" }, { status: 401 });
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


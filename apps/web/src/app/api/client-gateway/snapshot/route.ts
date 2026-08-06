import { NextResponse } from "next/server";
import { requireFluxIQUser } from "../../../../lib/auth";
import { getFluxIQ, getFluxIQWebRuntimeStatus } from "../../../../lib/fluxiq";

export async function GET() {
  const auth = await requireFluxIQUser();
  if (!auth) return NextResponse.json({ ok: false, error: "Authentication required" }, { status: 401 });
  const fluxiq = getFluxIQ();
  await fluxiq.programs.clientGateway.ready();
  return NextResponse.json({
    ok: true,
    payload: {
      ...fluxiq.programs.clientGateway.snapshot(),
      webRuntime: getFluxIQWebRuntimeStatus(auth.user.id)
    }
  });
}

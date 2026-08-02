import { NextRequest, NextResponse } from "next/server";
import { requireFluxIQUser } from "../../../../lib/auth";
import { getFluxIQWebRuntimeStatus, setAutomationStudioWebContext } from "../../../../lib/fluxiq";

export async function POST(request: NextRequest) {
  const auth = await requireFluxIQUser();
  if (!auth) return NextResponse.json({ ok: false, error: "Authentication required" }, { status: 401 });
  const body = await request.json().catch(() => ({})) as { activeProjectId?: unknown };
  const activeProjectId = typeof body.activeProjectId === "string" && body.activeProjectId.trim() ? body.activeProjectId.trim() : null;
  setAutomationStudioWebContext({ activeProjectId });
  return NextResponse.json({ ok: true, payload: getFluxIQWebRuntimeStatus() });
}

import { NextRequest, NextResponse } from "next/server";
import { requireFluxIQUser } from "../../../../lib/auth";
import { getFluxIQWebRuntimeStatus, setAutomationStudioWebContext } from "../../../../lib/fluxiq";

export async function POST(request: NextRequest) {
  const auth = await requireFluxIQUser();
  if (!auth) return NextResponse.json({ ok: false, error: "Authentication required" }, { status: 401 });
  if (!auth.role.permissions.includes("runtime.control")) return NextResponse.json({ ok: false, error: "Permission required: runtime.control" }, { status: 403 });
  const body = await request.json().catch(() => ({})) as { activeProjectId?: unknown; clientId?: unknown };
  const activeProjectId = typeof body.activeProjectId === "string" && body.activeProjectId.trim() ? body.activeProjectId.trim() : null;
  const clientId = typeof body.clientId === "string" && body.clientId.trim() ? body.clientId.trim() : undefined;
  setAutomationStudioWebContext({ operatorUserId: auth.user.id, ...(clientId ? { clientId } : {}), activeProjectId });
  return NextResponse.json({ ok: true, payload: getFluxIQWebRuntimeStatus(auth.user.id) });
}

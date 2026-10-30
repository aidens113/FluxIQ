import { NextRequest, NextResponse } from "next/server";
import { requireFluxIQUser } from "../../../../lib/auth";
import { getFluxIQ, getFluxIQWebRuntimeStatus, setAutomationStudioWebContext } from "../../../../lib/fluxiq";
import { appRouteIamContract, authorizeAppRoute, panelRouteActor } from "../../../../lib/app-route-iam";

const ROUTE = appRouteIamContract("POST", "/api/client-gateway/automation-studio-context");

export async function POST(request: NextRequest) {
  const auth = await requireFluxIQUser();
  if (!auth) return NextResponse.json({ ok: false, error: "Authentication required" }, { status: 401 });
  const body = await request.json().catch(() => ({})) as { activeProjectId?: unknown; activeFlowId?: unknown; clientId?: unknown };
  const activeProjectId = typeof body.activeProjectId === "string" && body.activeProjectId.trim() ? body.activeProjectId.trim() : null;
  const activeFlowId = activeProjectId && typeof body.activeFlowId === "string" && body.activeFlowId.trim() ? body.activeFlowId.trim() : null;
  const clientId = typeof body.clientId === "string" && body.clientId.trim() ? body.clientId.trim() : undefined;
  // Decided on the project and Flow it opens, so no one opens another person's.
  const refusal = await authorizeAppRoute(getFluxIQ().programs.api, ROUTE, "panel", panelRouteActor(auth), { activeProjectId, activeFlowId });
  if (refusal) return NextResponse.json({ ok: false, error: refusal.error }, { status: refusal.status });
  setAutomationStudioWebContext({ operatorUserId: auth.user.id, ...(clientId ? { clientId } : {}), activeProjectId, activeFlowId });
  return NextResponse.json({ ok: true, payload: getFluxIQWebRuntimeStatus(auth.user.id) });
}

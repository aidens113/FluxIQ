import { NextResponse } from "next/server";
import { requireFluxIQUser } from "../../../../lib/auth";
import { getFluxIQ } from "../../../../lib/fluxiq";
import { appRouteIamContract, authorizeAppRoute, panelRouteActor } from "../../../../lib/app-route-iam";

const ROUTE = appRouteIamContract("POST", "/api/client-gateway/dismiss-pairing");

export async function POST(request: Request) {
  const auth = await requireFluxIQUser();
  if (!auth) return NextResponse.json({ ok: false, error: "Authentication required" }, { status: 401 });
  const fluxiq = getFluxIQ();
  const refusal = await authorizeAppRoute(fluxiq.programs.api, ROUTE, "panel", panelRouteActor(auth));
  if (refusal) return NextResponse.json({ ok: false, error: refusal.error }, { status: refusal.status });
  const payload = await request.json().catch(() => undefined) as { pairingCode?: unknown } | undefined;
  const pairingCode = typeof payload?.pairingCode === "string" ? payload.pairingCode : "";
  if (!pairingCode) return NextResponse.json({ ok: false, error: "Pairing reference is required." }, { status: 400 });
  const dismissed = fluxiq.programs.clientGateway.dismissPairing(pairingCode);
  return NextResponse.json({ ok: true, payload: { dismissed } });
}

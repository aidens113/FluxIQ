import { NextResponse } from "next/server";
import { appRouteIamContract } from "../../../../lib/app-route-iam";
import { workspaceRouteContext } from "../../../../lib/workspaces/routes";

const ROUTE = appRouteIamContract("POST", "/api/client-gateway/dismiss-pairing");

export async function POST(request: Request) {
  const selected = await workspaceRouteContext(request, ROUTE);
  if (!selected.ok) return NextResponse.json({ ok: false, error: selected.error }, { status: selected.status });
  const owner = selected.context;
  try {
    const payload = await request.json().catch(() => undefined) as { pairingCode?: unknown } | undefined;
    const pairingCode = typeof payload?.pairingCode === "string" ? payload.pairingCode : "";
    if (!pairingCode) return NextResponse.json({ ok: false, error: "Pairing reference is required." }, { status: 400 });
    const dismissed = owner.fluxiq.programs.clientGateway.dismissPairing(pairingCode);
    return NextResponse.json({ ok: true, payload: { dismissed } });
  } finally {
    owner.release();
  }
}

import { NextResponse } from "next/server";
import { requireFluxIQUser } from "../../../../lib/auth";
import { getFluxIQ } from "../../../../lib/fluxiq";

export async function POST(request: Request) {
  const auth = await requireFluxIQUser();
  if (!auth) return NextResponse.json({ ok: false, error: "Authentication required" }, { status: 401 });
  const payload = await request.json().catch(() => undefined) as { pairingCode?: unknown } | undefined;
  const pairingCode = typeof payload?.pairingCode === "string" ? payload.pairingCode : "";
  if (!pairingCode) return NextResponse.json({ ok: false, error: "Pairing reference is required." }, { status: 400 });
  const dismissed = getFluxIQ().programs.clientGateway.dismissPairing(pairingCode);
  return NextResponse.json({ ok: true, payload: { dismissed } });
}

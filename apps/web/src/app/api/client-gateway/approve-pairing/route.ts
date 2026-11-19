import { NextResponse } from "next/server";
import { appRouteIamContract } from "../../../../lib/app-route-iam";
import { workspaceRouteContext } from "../../../../lib/workspaces/routes";

const ROUTE = appRouteIamContract("POST", "/api/client-gateway/approve-pairing");

/**
 * The gateway refuses an approval when the client is no longer waiting for it
 * (its browser disconnected, or it is already paired), naming the reason in a
 * `pairing.` code and a message written for the person approving. Any other
 * failure is unexpected and is not reported as a refusal.
 */
function pairingRefusal(error: unknown): { code: string; message: string } | null {
  if (!(error instanceof Error)) return null;
  const code = (error as Error & { code?: unknown }).code;
  return typeof code === "string" && code.startsWith("pairing.") ? { code, message: error.message } : null;
}

export async function POST(request: Request) {
  const selected = await workspaceRouteContext(request, ROUTE);
  if (!selected.ok) return NextResponse.json({ ok: false, error: selected.error }, { status: selected.status });
  const owner = selected.context;
  try {
    const payload = await request.json().catch(() => undefined) as { pairingCode?: unknown } | undefined;
    const pairingCode = typeof payload?.pairingCode === "string" ? payload.pairingCode : "";
    if (!pairingCode) return NextResponse.json({ ok: false, error: "Pairing reference is required." }, { status: 400 });
    const session = await owner.fluxiq.programs.clientGateway.approvePairing(pairingCode, { approvedByUserId: owner.caller.actor.userId, approvedBySessionId: owner.binding.sessionId });
    if (!session) return NextResponse.json({ ok: false, error: "Pairing request is no longer available." }, { status: 404 });
    return NextResponse.json({ ok: true, payload: { session } });
  } catch (error) {
    const refusal = pairingRefusal(error);
    if (!refusal) throw error;
    return NextResponse.json({ ok: false, error: refusal.message, code: refusal.code }, { status: 409 });
  } finally {
    owner.release();
  }
}

import { NextResponse } from "next/server";
import { requireFluxIQUser } from "../../../../lib/auth";
import { getFluxIQ } from "../../../../lib/fluxiq";

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
  const auth = await requireFluxIQUser();
  if (!auth) return NextResponse.json({ ok: false, error: "Authentication required" }, { status: 401 });
  if (!auth.role.permissions.includes("runtime.control")) return NextResponse.json({ ok: false, error: "Permission required: runtime.control" }, { status: 403 });
  const payload = await request.json().catch(() => undefined) as { pairingCode?: unknown } | undefined;
  const pairingCode = typeof payload?.pairingCode === "string" ? payload.pairingCode : "";
  if (!pairingCode) return NextResponse.json({ ok: false, error: "Pairing reference is required." }, { status: 400 });
  try {
    const session = await getFluxIQ().programs.clientGateway.approvePairing(pairingCode, { approvedByUserId: auth.user.id });
    if (!session) return NextResponse.json({ ok: false, error: "Pairing request is no longer available." }, { status: 404 });
    return NextResponse.json({ ok: true, payload: { session } });
  } catch (error) {
    const refusal = pairingRefusal(error);
    if (!refusal) throw error;
    return NextResponse.json({ ok: false, error: refusal.message, code: refusal.code }, { status: 409 });
  }
}

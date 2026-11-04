import { NextResponse } from "next/server";
import { secretKeyPairedHolderId } from "fluxiq/secret-keys";
import { requireFluxIQUser } from "../../../../lib/auth";
import { getFluxIQ } from "../../../../lib/fluxiq";
import { appRouteIamContract, authorizeAppRoute, panelRouteActor } from "../../../../lib/app-route-iam";

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

/** The browser is paired whatever this does: one that could not be unlocked here shows the Unlock step. */
async function unlockApprovedClient(fluxiq: ReturnType<typeof getFluxIQ>, auth: NonNullable<Awaited<ReturnType<typeof requireFluxIQUser>>>, password: string, trustedClientId: string): Promise<boolean> {
  try {
    await fluxiq.programs.secretKeys.unlockSession({ sessionId: auth.session.id, userId: auth.user.id, authorizationPassword: password, expiresAtMs: auth.session.expiresAtMs, unlockClients: [secretKeyPairedHolderId(trustedClientId)], passwordVerified: true });
    return true;
  } catch (error) {
    console.warn("FluxIQ paired a browser but could not unlock it at approval.", error instanceof Error ? error.name : "non_error");
    return false;
  }
}

export async function POST(request: Request) {
  const auth = await requireFluxIQUser();
  if (!auth) return NextResponse.json({ ok: false, error: "Authentication required" }, { status: 401 });
  const fluxiq = getFluxIQ();
  const refusal = await authorizeAppRoute(fluxiq.programs.api, ROUTE, "panel", panelRouteActor(auth));
  if (refusal) return NextResponse.json({ ok: false, error: refusal.error }, { status: refusal.status });
  const payload = await request.json().catch(() => undefined) as { pairingCode?: unknown; password?: unknown; totp?: unknown } | undefined;
  const pairingCode = typeof payload?.pairingCode === "string" ? payload.pairingCode : "";
  if (!pairingCode) return NextResponse.json({ ok: false, error: "Pairing reference is required." }, { status: 400 });
  // Optional, and setup rather than a gate: given, the browser is unlocked at once and for its credential's life; not given, it pairs and shows the one-time Unlock step.
  const password = typeof payload?.password === "string" && payload.password ? payload.password : undefined;
  if (password) {
    const totp = typeof payload?.totp === "string" ? payload.totp : undefined;
    try {
      await fluxiq.programs.identityAccess.authorizeSessionCredentials({ sessionId: auth.session.id, password, pin: undefined, totp, requirePin: false });
    } catch (error) {
      return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "That password was not accepted, so nothing was paired.", code: "pairing.password_refused" }, { status: 403 });
    }
  }
  try {
    const session = await fluxiq.programs.clientGateway.approvePairing(pairingCode, { approvedByUserId: auth.user.id, approvedBySessionId: auth.session.id });
    if (!session) return NextResponse.json({ ok: false, error: "Pairing request is no longer available." }, { status: 404 });
    const unlocked = password && session.trustedClientId ? await unlockApprovedClient(fluxiq, auth, password, session.trustedClientId) : false;
    return NextResponse.json({ ok: true, payload: { session, unlocked } });
  } catch (error) {
    const refusal = pairingRefusal(error);
    if (!refusal) throw error;
    return NextResponse.json({ ok: false, error: refusal.message, code: refusal.code }, { status: 409 });
  }
}

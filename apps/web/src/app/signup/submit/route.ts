import { NextResponse } from "next/server";
import { resolveFluxIQDeploymentSettings } from "fluxiq/platform/profile";
import { throttleForm, trustedClientAddress } from "../../../lib/form-throttle";
import { getPlatformServices } from "../../../server/provisioning-listener";
import { toAccountLinkHttp } from "../../welcome/server";
import { signupEmailKey, submitSignup } from "../server";

// Signing up: per trusted client address 10 requests per 10 minutes, and per
// normalised email 3 per 15 minutes (so no one can flood an inbox), as for
// asking for a reset link.
const ADDRESS_LIMIT = { max: 10, windowMs: 10 * 60 * 1000 };
const EMAIL_LIMIT = { max: 3, windowMs: 15 * 60 * 1000 };

/** `POST /signup/submit`: 404 unless `FLUXIQ_SIGNUP=open` on `service`; then throttled, and provisioning runs in-process. */
export async function POST(request: Request) {
  if (resolveFluxIQDeploymentSettings(process.env).signup !== "open") {
    return NextResponse.json({ ok: false, code: "not_found" }, { status: 404, headers: { "cache-control": "no-store" } });
  }
  const throttled = throttleForm("signup", [
    { name: "address", key: trustedClientAddress(request), limit: ADDRESS_LIMIT },
    { name: "email", key: await signupEmailKey(request), limit: EMAIL_LIMIT },
  ]);
  if (throttled) return throttled;
  const services = await getPlatformServices();
  return toAccountLinkHttp(await submitSignup(request, { provisioning: services.provisioning }));
}

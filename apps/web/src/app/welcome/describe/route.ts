import { NextResponse } from "next/server";
import { throttleForm, trustedClientAddress } from "../../../lib/form-throttle";
import { getPlatformServices } from "../../../server/provisioning-listener";
import { describeWelcome } from "../server";

// Reading what a welcome link is for: per trusted client address, 20 requests per 10 minutes, as setting the password.
const ADDRESS_LIMIT = { max: 20, windowMs: 10 * 60 * 1000 };

/** Says what a welcome link is for (email, role, workspace kind) without spending it. Never cached; never the token. */
export async function POST(request: Request) {
  const throttled = throttleForm("welcome-describe", [{ name: "address", key: trustedClientAddress(request), limit: ADDRESS_LIMIT }]);
  if (throttled) return throttled;
  const services = await getPlatformServices();
  const answer = await describeWelcome(request, { store: services.store, now: Date.now });
  return NextResponse.json(answer.body, { status: answer.status, headers: { "cache-control": "no-store" } });
}

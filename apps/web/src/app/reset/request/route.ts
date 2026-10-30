import { throttleForm, trustedClientAddress } from "../../../lib/form-throttle";
import { getPlatformServices } from "../../../server/provisioning-listener";
import { toAccountLinkHttp } from "../../welcome/server";
import { requestReset } from "../requestReset";

// Asking for a reset link: per trusted client address 10 requests per 10 minutes,
// and per normalised email 3 per 15 minutes (so no one can flood an inbox).
const ADDRESS_LIMIT = { max: 10, windowMs: 10 * 60 * 1000 };
const EMAIL_LIMIT = { max: 3, windowMs: 15 * 60 * 1000 };

export async function POST(request: Request) {
  const throttled = throttleForm("reset-request", [
    { name: "address", key: trustedClientAddress(request), limit: ADDRESS_LIMIT },
    { name: "email", key: await normalisedEmail(request), limit: EMAIL_LIMIT },
  ]);
  if (throttled) return throttled;
  const services = await getPlatformServices();
  return toAccountLinkHttp(await requestReset(request, { links: services.links }));
}

async function normalisedEmail(request: Request): Promise<string | null> {
  let body: { email?: unknown } | null;
  try {
    body = (await request.clone().json()) as { email?: unknown } | null;
  } catch (error) {
    // A body that is not JSON has no email; the handler answers it with a 400.
    if (error instanceof SyntaxError) return null;
    throw error;
  }
  return typeof body?.email === "string" && body.email.trim() ? body.email.trim().toLowerCase() : null;
}

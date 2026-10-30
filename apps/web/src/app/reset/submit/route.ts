import { throttleForm, trustedClientAddress } from "../../../lib/form-throttle";
import { getPlatformServices } from "../../../server/provisioning-listener";
import { toAccountLinkHttp } from "../../welcome/server";
import { submitReset } from "../submitReset";

// Choosing a new password: per trusted client address, 20 requests per 10 minutes.
const ADDRESS_LIMIT = { max: 20, windowMs: 10 * 60 * 1000 };

export async function POST(request: Request) {
  const throttled = throttleForm("reset-submit", [{ name: "address", key: trustedClientAddress(request), limit: ADDRESS_LIMIT }]);
  if (throttled) return throttled;
  const services = await getPlatformServices();
  return toAccountLinkHttp(await submitReset(request, { links: services.links }));
}

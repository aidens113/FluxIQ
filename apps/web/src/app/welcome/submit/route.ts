import { getFluxIQ } from "../../../lib/fluxiq";
import { throttleForm, trustedClientAddress } from "../../../lib/form-throttle";
import { getPlatformServices } from "../../../server/provisioning-listener";
import { submitWelcome, toAccountLinkHttp } from "../server";

// Setting a first password: per trusted client address, 20 requests per 10 minutes.
const ADDRESS_LIMIT = { max: 20, windowMs: 10 * 60 * 1000 };

export async function POST(request: Request) {
  const throttled = throttleForm("welcome-submit", [{ name: "address", key: trustedClientAddress(request), limit: ADDRESS_LIMIT }]);
  if (throttled) return throttled;
  const services = await getPlatformServices();
  const { identityAccess, secretKeys } = getFluxIQ().programs;
  return toAccountLinkHttp(await submitWelcome(request, { links: services.links, provisioning: services.provisioning, identityAccess, secretKeys }));
}

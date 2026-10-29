import { getFluxIQ } from "../../../lib/fluxiq";
import { getPlatformServices } from "../../../server/provisioning-listener";
import { submitWelcome, toAccountLinkHttp } from "../server";

export async function POST(request: Request) {
  const services = await getPlatformServices();
  const { identityAccess, secretKeys } = getFluxIQ().programs;
  return toAccountLinkHttp(await submitWelcome(request, { links: services.links, provisioning: services.provisioning, identityAccess, secretKeys }));
}

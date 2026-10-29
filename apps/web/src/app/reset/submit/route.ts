import { getPlatformServices } from "../../../server/provisioning-listener";
import { toAccountLinkHttp } from "../../welcome/server";
import { submitReset } from "../submitReset";

export async function POST(request: Request) {
  const services = await getPlatformServices();
  return toAccountLinkHttp(await submitReset(request, { links: services.links }));
}

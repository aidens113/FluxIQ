import { getPlatformServices } from "../../../server/provisioning-listener";
import { toAccountLinkHttp } from "../../welcome/server";
import { requestReset } from "../requestReset";

export async function POST(request: Request) {
  const services = await getPlatformServices();
  return toAccountLinkHttp(await requestReset(request, { links: services.links }));
}

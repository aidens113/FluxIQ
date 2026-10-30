import { resolveFluxIQDeploymentSettings } from "fluxiq/platform/profile";
import { getFluxIQ } from "../../../lib/fluxiq";
import { getPlatformServices } from "../../../server/provisioning-listener";
import { setupAttempts, submitOwnerClaim, toSetupHttp } from "../server";

export async function POST(request: Request) {
  const settings = resolveFluxIQDeploymentSettings(process.env);
  // `local` never composes the platform services for this route: it is not found there.
  if (settings.profile === "local") return toSetupHttp({ status: 404, body: { ok: false, code: "not_found" } });
  const fluxiq = getFluxIQ();
  const services = await getPlatformServices();
  const { identityAccess, secretKeys } = fluxiq.programs;
  const fluxiqDir = fluxiq.paths.fluxiq;
  return toSetupHttp(await submitOwnerClaim(request, { settings, fluxiqDir, provisioning: services.provisioning, identityAccess, secretKeys, attempts: setupAttempts(fluxiqDir) }));
}

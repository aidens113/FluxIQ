import { resolveFluxIQDeploymentSettings } from "fluxiq/platform/profile";
import { platformScope } from "../../../lib/platform";
import { restoreLoginKeys } from "../../../server/connect";
import { getPlatformServices } from "../../../server/provisioning-listener";
import { setupAttempts, submitLocalOwnerClaim, submitOwnerClaim, toSetupHttp } from "../server";

export async function POST(request: Request) {
  const settings = resolveFluxIQDeploymentSettings(process.env);
  const { identityAccess, fluxiqDir } = platformScope();
  // `local` claims through identity access alone: no platform services, no email.
  if (settings.profile === "local") {
    return toSetupHttp(await submitLocalOwnerClaim(request, {
      identity: identityAccess,
      restoreKeys: restoreLoginKeys,
      attempts: setupAttempts(fluxiqDir)
    }));
  }
  const services = await getPlatformServices();
  return toSetupHttp(await submitOwnerClaim(request, { settings, fluxiqDir, provisioning: services.provisioning, identityAccess, restoreKeys: restoreLoginKeys, attempts: setupAttempts(fluxiqDir) }));
}
